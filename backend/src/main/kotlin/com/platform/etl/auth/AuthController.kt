package com.platform.etl.auth

import com.platform.etl.domain.user.RefreshToken
import com.platform.etl.domain.user.RefreshTokenRepository
import com.platform.etl.domain.user.User
import com.platform.etl.domain.user.UserRepository
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.ResponseEntity
import org.springframework.security.core.annotation.AuthenticationPrincipal
import org.springframework.security.crypto.password.PasswordEncoder
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.security.MessageDigest
import java.time.LocalDateTime
import java.util.UUID

@RestController
@RequestMapping("/api/auth")
class AuthController(
    private val jwtService: JwtService,
    private val userRepository: UserRepository,
    private val refreshTokenRepository: RefreshTokenRepository,
    private val passwordEncoder: PasswordEncoder,
    @Value("\${etl.jwt.refresh-token-days:7}") private val refreshDays: Long
) {

    data class UserDto(
        val id: String, val name: String, val email: String,
        val provider: String, val avatarUrl: String?, val role: String
    )

    data class TokenResponse(val accessToken: String, val user: UserDto)
    data class RegisterRequest(val name: String, val email: String, val password: String)
    data class LoginRequest(val email: String, val password: String)

    // 회원가입 (이메일/비밀번호)
    @PostMapping("/register")
    @Transactional
    fun register(@RequestBody req: RegisterRequest): ResponseEntity<UserDto> {
        if (req.name.isBlank() || req.email.isBlank() || req.password.length < 6) {
            return ResponseEntity.badRequest().build()
        }
        if (userRepository.findByEmail(req.email) != null) {
            return ResponseEntity.status(409).build()   // 이미 사용 중인 이메일
        }
        val user = userRepository.save(
            User(
                provider = "local",
                providerId = req.email,
                name = req.name,
                email = req.email,
                passwordHash = passwordEncoder.encode(req.password)
            )
        )
        return ResponseEntity.status(201).body(user.toDto())
    }

    // 로그인 (이메일/비밀번호)
    @PostMapping("/login")
    @Transactional
    fun login(
        @RequestBody req: LoginRequest,
        response: HttpServletResponse
    ): ResponseEntity<TokenResponse> {
        val user = userRepository.findByProviderAndProviderId("local", req.email)
            ?: return ResponseEntity.status(401).build()

        if (user.passwordHash == null || !passwordEncoder.matches(req.password, user.passwordHash)) {
            return ResponseEntity.status(401).build()
        }

        val accessToken = jwtService.generateAccessToken(
            userId = user.id.toString(), email = user.email, name = user.name
        )

        val rawRefreshToken = UUID.randomUUID().toString() + UUID.randomUUID().toString()
        val tokenHash = sha256Hex(rawRefreshToken)
        val expiresAt = LocalDateTime.now().plusDays(refreshDays)

        refreshTokenRepository.deleteAllByUserId(user.id)
        refreshTokenRepository.save(RefreshToken(user = user, tokenHash = tokenHash, expiresAt = expiresAt))

        response.addHeader("Set-Cookie",
            "etl_refresh=$rawRefreshToken; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=${refreshDays * 24 * 60 * 60}")

        return ResponseEntity.ok(TokenResponse(accessToken, user.toDto()))
    }

    // 현재 로그인 유저 정보
    @GetMapping("/me")
    fun me(@AuthenticationPrincipal user: User): ResponseEntity<UserDto> =
        ResponseEntity.ok(user.toDto())

    // Refresh Token으로 Access Token 갱신
    @PostMapping("/refresh")
    fun refresh(request: HttpServletRequest): ResponseEntity<TokenResponse> {
        val rawToken = request.cookies
            ?.firstOrNull { it.name == "etl_refresh" }?.value
            ?: return ResponseEntity.status(401).build()

        val tokenHash = sha256Hex(rawToken)
        val stored = refreshTokenRepository.findByTokenHash(tokenHash)
            ?: return ResponseEntity.status(401).build()

        if (stored.expiresAt.isBefore(LocalDateTime.now())) {
            refreshTokenRepository.delete(stored)
            return ResponseEntity.status(401).build()
        }

        val user = stored.user
        val newAccessToken = jwtService.generateAccessToken(
            userId = user.id.toString(), email = user.email, name = user.name
        )
        return ResponseEntity.ok(TokenResponse(newAccessToken, user.toDto()))
    }

    // 로그아웃 — 쿠키 삭제 + DB에서 refresh token 무효화
    @DeleteMapping("/logout")
    fun logout(
        request: HttpServletRequest,
        response: HttpServletResponse,
        @AuthenticationPrincipal user: User?
    ): ResponseEntity<Void> {
        user?.let { refreshTokenRepository.deleteAllByUserId(it.id) }
        clearRefreshCookie(response)
        return ResponseEntity.noContent().build()
    }

    private fun clearRefreshCookie(response: HttpServletResponse) {
        response.addHeader("Set-Cookie",
            "etl_refresh=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0")
    }

    private fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun User.toDto() = UserDto(
        id = id.toString(), name = name, email = email,
        provider = provider, avatarUrl = avatarUrl, role = role
    )
}

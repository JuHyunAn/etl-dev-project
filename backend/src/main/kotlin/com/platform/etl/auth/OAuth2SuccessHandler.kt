package com.platform.etl.auth

import com.platform.etl.domain.user.RefreshToken
import com.platform.etl.domain.user.RefreshTokenRepository
import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.core.Authentication
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler
import org.springframework.stereotype.Component
import java.net.URLEncoder
import java.security.MessageDigest
import java.time.LocalDateTime
import java.util.UUID

@Component
class OAuth2SuccessHandler(
    private val jwtService: JwtService,
    private val refreshTokenRepository: RefreshTokenRepository,
    @Value("\${etl.frontend-url:http://localhost:3001}") private val frontendUrl: String,
    @Value("\${etl.jwt.refresh-token-days:7}") private val refreshDays: Long
) : SimpleUrlAuthenticationSuccessHandler() {

    override fun onAuthenticationSuccess(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authentication: Authentication
    ) {
        val principal = authentication.principal as OAuthUserPrincipal
        val user = principal.user

        // 1. Access Token (JWT, 15분)
        val accessToken = jwtService.generateAccessToken(
            userId = user.id.toString(),
            email = user.email,
            name = user.name
        )

        // 2. Refresh Token (랜덤 UUID → SHA-256 해시로 DB 저장)
        val rawRefreshToken = UUID.randomUUID().toString() + UUID.randomUUID().toString()
        val tokenHash = sha256Hex(rawRefreshToken)
        val expiresAt = LocalDateTime.now().plusDays(refreshDays)

        // 기존 토큰 만료분 정리 (선택적: 1 유저 1 토큰 정책)
        refreshTokenRepository.deleteAllByUserId(user.id)
        refreshTokenRepository.save(
            RefreshToken(user = user, tokenHash = tokenHash, expiresAt = expiresAt)
        )

        // 3. Refresh Token → HttpOnly + Secure + SameSite=Strict 쿠키
        val cookie = Cookie("etl_refresh", rawRefreshToken).apply {
            isHttpOnly = true
            secure = request.isSecure   // HTTPS 환경에서만 Secure 플래그 (로컬 개발 편의)
            path = "/api/auth"          // /api/auth/** 경로에서만 전송
            maxAge = (refreshDays * 24 * 60 * 60).toInt()
        }
        response.addCookie(cookie)
        // SameSite는 Cookie API가 직접 지원 안 해서 헤더로 추가
        response.addHeader("Set-Cookie",
            "etl_refresh=$rawRefreshToken; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=${cookie.maxAge}")

        // 4. 프론트엔드로 리다이렉트 (access token을 URL fragment에 담아 전달)
        //    fragment는 서버에 전송되지 않으므로 서버 로그에 노출 X
        val encodedName = URLEncoder.encode(user.name, "UTF-8")
        val encodedEmail = URLEncoder.encode(user.email, "UTF-8")
        val redirectUrl = "$frontendUrl/auth/callback" +
            "#access_token=$accessToken" +
            "&provider=${user.provider}" +
            "&name=$encodedName" +
            "&email=$encodedEmail" +
            "&avatar=${user.avatarUrl ?: ""}"

        response.sendRedirect(redirectUrl)
    }

    private fun sha256Hex(input: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }
}

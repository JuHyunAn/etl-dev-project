package com.platform.etl.auth

import com.platform.etl.domain.user.UserRepository
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter
import java.util.UUID

@Component
class JwtAuthFilter(
    private val jwtService: JwtService,
    private val userRepository: UserRepository
) : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        chain: FilterChain
    ) {
        val header = request.getHeader("Authorization")
        if (header != null && header.startsWith("Bearer ")) {
            val token = header.removePrefix("Bearer ")
            val userId = jwtService.validateAndGetSubject(token)
            if (userId != null && SecurityContextHolder.getContext().authentication == null) {
                val user = runCatching { userRepository.findById(UUID.fromString(userId)).orElse(null) }.getOrNull()
                if (user != null) {
                    val auth = UsernamePasswordAuthenticationToken(
                        user, null,
                        listOf(SimpleGrantedAuthority("ROLE_${user.role}"))
                    )
                    SecurityContextHolder.getContext().authentication = auth
                }
            }
        }
        chain.doFilter(request, response)
    }
}

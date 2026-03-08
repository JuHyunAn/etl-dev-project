package com.platform.etl.auth

import io.jsonwebtoken.JwtException
import io.jsonwebtoken.Jwts
import io.jsonwebtoken.security.Keys
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.util.*
import javax.crypto.SecretKey

@Service
class JwtService(
    @Value("\${etl.jwt.secret}") secret: String,
    @Value("\${etl.jwt.access-token-minutes:15}") private val accessTokenMinutes: Long
) {
    private val key: SecretKey = Keys.hmacShaKeyFor(Base64.getDecoder().decode(secret))

    fun generateAccessToken(userId: String, email: String, name: String): String {
        val now = Date()
        return Jwts.builder()
            .subject(userId)
            .claim("email", email)
            .claim("name", name)
            .issuedAt(now)
            .expiration(Date(now.time + accessTokenMinutes * 60 * 1000))
            .signWith(key)
            .compact()
    }

    fun validateAndGetSubject(token: String): String? = try {
        Jwts.parser().verifyWith(key).build()
            .parseSignedClaims(token).payload.subject
    } catch (_: JwtException) { null }
      catch (_: IllegalArgumentException) { null }
}

package com.platform.etl.auth

import com.platform.etl.domain.user.User
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.oauth2.core.user.OAuth2User

class OAuthUserPrincipal(
    val user: User,
    private val attributes: Map<String, Any>
) : OAuth2User {
    override fun getAttributes() = attributes
    override fun getAuthorities() = listOf(SimpleGrantedAuthority("ROLE_${user.role}"))
    override fun getName() = user.id.toString()
}

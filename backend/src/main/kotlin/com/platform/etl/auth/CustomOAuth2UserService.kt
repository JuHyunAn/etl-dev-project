package com.platform.etl.auth

import com.platform.etl.domain.user.User
import com.platform.etl.domain.user.UserRepository
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService
import org.springframework.security.oauth2.client.userinfo.OAuth2UserRequest
import org.springframework.security.oauth2.core.user.OAuth2User
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDateTime

@Service
class CustomOAuth2UserService(
    private val userRepository: UserRepository
) : DefaultOAuth2UserService() {

    @Transactional
    override fun loadUser(userRequest: OAuth2UserRequest): OAuth2User {
        val oAuth2User = super.loadUser(userRequest)
        val registrationId = userRequest.clientRegistration.registrationId   // "github" | "google"
        val attrs = oAuth2User.attributes

        val (providerId, name, email, avatarUrl) = when (registrationId) {
            "github" -> Quad(
                attrs["id"].toString(),
                attrs["name"]?.toString() ?: attrs["login"]?.toString() ?: "GitHub User",
                attrs["email"]?.toString() ?: "${attrs["login"]}@github.local",
                attrs["avatar_url"]?.toString()
            )
            "google" -> Quad(
                attrs["sub"].toString(),
                attrs["name"]?.toString() ?: "Google User",
                attrs["email"]?.toString() ?: "",
                attrs["picture"]?.toString()
            )
            else -> throw IllegalArgumentException("Unsupported provider: $registrationId")
        }

        val user = userRepository.findByProviderAndProviderId(registrationId, providerId)
            ?.also { existing ->
                existing.name = name
                existing.email = email
                existing.avatarUrl = avatarUrl
                existing.updatedAt = LocalDateTime.now()
                userRepository.save(existing)
            }
            ?: userRepository.save(
                User(provider = registrationId, providerId = providerId,
                     name = name, email = email, avatarUrl = avatarUrl)
            )

        return OAuthUserPrincipal(user, attrs)
    }

    private data class Quad<A, B, C, D>(val a: A, val b: B, val c: C, val d: D)
    private operator fun <A, B, C, D> Quad<A, B, C, D>.component1() = a
    private operator fun <A, B, C, D> Quad<A, B, C, D>.component2() = b
    private operator fun <A, B, C, D> Quad<A, B, C, D>.component3() = c
    private operator fun <A, B, C, D> Quad<A, B, C, D>.component4() = d
}

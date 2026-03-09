package com.platform.etl.config

import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.UrlBasedCorsConfigurationSource
import org.springframework.web.filter.CorsFilter

@Configuration
class CorsConfig(
    @Value("\${etl.frontend-url:http://localhost:3001}") private val frontendUrl: String
) {

    @Bean
    fun corsFilter(): CorsFilter {
        val source = UrlBasedCorsConfigurationSource()
        val config = CorsConfiguration().apply {
            allowCredentials = true
            addAllowedOriginPattern("http://localhost:*")
            if (frontendUrl.isNotBlank() && !frontendUrl.startsWith("http://localhost")) {
                addAllowedOrigin(frontendUrl)
            }
            addAllowedHeader("*")
            addAllowedMethod("*")
        }
        source.registerCorsConfiguration("/api/**", config)
        source.registerCorsConfiguration("/oauth2/**", config)
        source.registerCorsConfiguration("/login/**", config)
        return CorsFilter(source)
    }
}

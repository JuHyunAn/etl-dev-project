package com.platform.etl.config

import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.time.LocalDateTime

data class ErrorResponse(val timestamp: LocalDateTime, val status: Int, val error: String, val message: String?)

@RestControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(NoSuchElementException::class)
    fun handleNotFound(e: NoSuchElementException) =
        ResponseEntity.status(HttpStatus.NOT_FOUND)
            .body(ErrorResponse(LocalDateTime.now(), 404, "Not Found", e.message))

    @ExceptionHandler(IllegalArgumentException::class)
    fun handleBadRequest(e: IllegalArgumentException) =
        ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponse(LocalDateTime.now(), 400, "Bad Request", e.message))

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidation(e: MethodArgumentNotValidException): ResponseEntity<ErrorResponse> {
        val msg = e.bindingResult.fieldErrors.joinToString("; ") { "${it.field}: ${it.defaultMessage}" }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(ErrorResponse(LocalDateTime.now(), 400, "Validation Failed", msg))
    }

    @ExceptionHandler(Exception::class)
    fun handleGeneral(e: Exception) =
        ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(ErrorResponse(LocalDateTime.now(), 500, "Internal Server Error", e.message))
}

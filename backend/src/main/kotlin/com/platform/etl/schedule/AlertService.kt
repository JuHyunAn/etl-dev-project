package com.platform.etl.schedule

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.mail.MailException
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.MimeMessageHelper
import org.springframework.stereotype.Service

@Service
class AlertService(
    private val mailSender: JavaMailSender,
    @Value("\${etl.alert.from}") private val from: String,
    @Value("\${spring.mail.username:}") private val smtpUsername: String,
) {
    private val log = LoggerFactory.getLogger(AlertService::class.java)

    /** SMTP가 설정되지 않은 환경(로컬 등)에서는 로그만 출력 */
    private val mailConfigured get() = smtpUsername.isNotBlank()

    fun sendScheduleAlert(
        to: String,
        scheduleName: String,
        finalStatus: String,
        startedAt: String,
        finishedAt: String?,
        totalSteps: Int?,
        completedSteps: Int,
        failedSteps: Int,
        errorSummary: String?
    ) {
        val subject = "[ETL Platform] Schedule '$scheduleName' — $finalStatus"
        val statusColor = when (finalStatus) {
            "SUCCESS"  -> "#16a34a"
            "FAILED"   -> "#dc2626"
            "PARTIAL"  -> "#d97706"
            else       -> "#6b7280"
        }
        val body = """
            <html><body style="font-family:sans-serif;color:#1f2937;padding:24px">
              <h2 style="margin:0 0 12px"workflow run</h2>
              <table style="border-collapse:collapse;width:100%;max-width:480px">
                <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">스케줄</td>
                    <td style="padding:6px 12px">$scheduleName</td></tr>
                <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">상태</td>
                    <td style="padding:6px 12px;color:$statusColor;font-weight:700">$finalStatus</td></tr>
                <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">시작</td>
                    <td style="padding:6px 12px">$startedAt</td></tr>
                <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">종료</td>
                    <td style="padding:6px 12px">${finishedAt ?: "-"}</td></tr>
                <tr><td style="padding:6px 12px;background:#f1f5f9;font-weight:600">Steps</td>
                    <td style="padding:6px 12px">전체 ${totalSteps ?: "-"} / 성공 $completedSteps / 실패 $failedSteps</td></tr>
                ${if (errorSummary != null) """
                <tr><td style="padding:6px 12px;background:#fef2f2;font-weight:600;color:#dc2626">오류</td>
                    <td style="padding:6px 12px;color:#dc2626">$errorSummary</td></tr>""" else ""}
              </table>
            </body></html>
        """.trimIndent()

        if (!mailConfigured) {
            log.info("[ALERT-NOOP] mail not configured. would send to=$to subject='$subject'")
            return
        }

        try {
            val mime = mailSender.createMimeMessage()
            MimeMessageHelper(mime, false, "UTF-8").apply {
                setFrom(from)
                setTo(to)
                setSubject(subject)
                setText(body, true)
            }
            mailSender.send(mime)
            log.info("[ALERT] sent to=$to subject='$subject'")
        } catch (e: MailException) {
            log.error("[ALERT] failed to send email to=$to : ${e.message}")
        }
    }
}

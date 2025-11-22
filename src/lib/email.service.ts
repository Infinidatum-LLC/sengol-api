/**
 * Email Service
 *
 * Handles sending emails via Resend API for:
 * - Password reset links
 * - Email verification
 * - Other transactional emails
 */

import { Resend } from 'resend'
import { config } from '../config/env'

const resendApiKey = process.env.RESEND_API_KEY
const emailFrom = process.env.EMAIL_FROM || 'noreply@sengol.ai'
const frontendUrl = process.env.FRONTEND_URL || 'https://sengol.ai'

// Initialize Resend client (only if API key is provided)
const resend = resendApiKey ? new Resend(resendApiKey) : null

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  userName?: string
): Promise<void> {
  if (!resend) {
    console.warn('[EMAIL] Resend API key not configured, skipping password reset email')
    console.log(`[EMAIL] Password reset token for ${email}: ${resetToken}`)
    return
  }

  const resetUrl = `${frontendUrl}/auth/reset-password?token=${resetToken}`

  try {
    await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: 'Reset Your Password - Sengol',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Sengol</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #1f2937; margin-top: 0;">Reset Your Password</h2>
            <p>Hello${userName ? ` ${userName}` : ''},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Reset Password</a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <p style="color: #667eea; font-size: 14px; word-break: break-all;">${resetUrl}</p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">© ${new Date().getFullYear()} Sengol. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
Reset Your Password - Sengol

Hello${userName ? ` ${userName}` : ''},

We received a request to reset your password. Click the link below to create a new password:

${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.

© ${new Date().getFullYear()} Sengol. All rights reserved.
      `.trim(),
    })

    console.log(`[EMAIL] Password reset email sent to ${email}`)
  } catch (error) {
    console.error('[EMAIL] Failed to send password reset email:', error)
    // Don't throw - we don't want to reveal if email exists
    // Just log the error for debugging
  }
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(
  email: string,
  verificationToken: string,
  userName?: string
): Promise<void> {
  if (!resend) {
    console.warn('[EMAIL] Resend API key not configured, skipping verification email')
    console.log(`[EMAIL] Verification token for ${email}: ${verificationToken}`)
    return
  }

  const verificationUrl = `${frontendUrl}/auth/verify-email?token=${verificationToken}`

  try {
    await resend.emails.send({
      from: emailFrom,
      to: email,
      subject: 'Verify Your Email - Sengol',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Sengol</h1>
          </div>
          <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
            <h2 style="color: #1f2937; margin-top: 0;">Verify Your Email</h2>
            <p>Hello${userName ? ` ${userName}` : ''},</p>
            <p>Thank you for signing up! Please verify your email address by clicking the button below:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600;">Verify Email</a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <p style="color: #667eea; font-size: 14px; word-break: break-all;">${verificationUrl}</p>
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">© ${new Date().getFullYear()} Sengol. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
      text: `
Verify Your Email - Sengol

Hello${userName ? ` ${userName}` : ''},

Thank you for signing up! Please verify your email address by clicking the link below:

${verificationUrl}

This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.

© ${new Date().getFullYear()} Sengol. All rights reserved.
      `.trim(),
    })

    console.log(`[EMAIL] Verification email sent to ${email}`)
  } catch (error) {
    console.error('[EMAIL] Failed to send verification email:', error)
    throw error // Re-throw for verification email - caller should handle
  }
}


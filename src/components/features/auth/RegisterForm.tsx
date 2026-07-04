'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { ROUTES } from '@/constants/routes'
import { getAuthCallbackUrl } from '@/lib/siteUrl'
import { createClient } from '@/lib/supabase/client'
import { validatePassword } from '@/lib/validations/passwordValidation'

export function RegisterForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({})
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrors({})

    // Client-side password validation — no network call if invalid (Req 4.7)
    const pwCheck = validatePassword(password)
    if (!pwCheck.valid) {
      setErrors({ password: pwCheck.error })
      return
    }

    setIsLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getAuthCallbackUrl(),
        },
      })

      if (error) {
        if (
          error.message.toLowerCase().includes('already registered') ||
          error.message.toLowerCase().includes('already been registered')
        ) {
          setErrors({ email: 'This email is already in use.' })
        } else {
          setErrors({ form: error.message })
        }
        return
      }

      setSuccess(true)
    } finally {
      setIsLoading(false)
    }
  }

  if (success) {
    return (
      <div className="surface-panel p-8 text-center">
        <h2 className="mb-2 text-xl font-semibold text-neutral-900">Check your email</h2>
        <p className="text-neutral-700">
          We sent a verification link to <strong>{email}</strong>. Click the link to activate your
          account.
        </p>
        <Link
          href={ROUTES.LOGIN}
          className="mt-6 inline-block text-sm font-medium text-primary-600 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="surface-panel p-7 sm:p-8">
      <div className="mb-7 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-atlas-700">
          Start planning
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-900">
          Create your account
        </h1>
        <p className="mt-1 text-sm text-neutral-700">
          Build your profile once, then generate smarter travel plans
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />

        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            required
            hint="8-128 characters"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-[38px] text-sm text-neutral-700 hover:text-neutral-900"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        {errors.form && (
          <p role="alert" className="text-sm text-error-500">
            {errors.form}
          </p>
        )}

        <Button type="submit" isLoading={isLoading} className="mt-2 w-full">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-700">
        Already have an account?{' '}
        <Link href={ROUTES.LOGIN} className="font-medium text-primary-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage('')

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        
        if (error) throw error
        setMessage('Check your email to confirm your account')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        
        if (error) throw error
        setMessage('Signed in successfully')
        setTimeout(() => onClose(), 1500)
      }
    } catch (error: any) {
      setMessage(error.message || 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#2d3d34]/90 backdrop-blur-sm"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="relative bg-[#f5f3ed] border border-[#d4cfc0] max-w-md w-full shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-[#7a8a7d] hover:text-[#2d3d34] text-2xl font-light"
            >
              ×
            </button>

            <div className="p-8">
              <div className="mb-8">
                <div className="inline-flex items-center gap-2 mb-4">
                  <div className="w-6 h-px bg-[#5b7c6f]"></div>
                  <span className="text-[#5b7c6f] text-xs tracking-widest font-light">
                    {isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
                  </span>
                </div>
                <h2 className="text-3xl font-light text-[#2d3d34] tracking-wide">
                  {isSignUp ? 'Join the archive' : 'Welcome back'}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-[#5b7c6f] text-sm font-light tracking-wide mb-2">
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-[#d4cfc0] text-[#2d3d34] font-light focus:outline-none focus:border-[#5b7c6f] transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[#5b7c6f] text-sm font-light tracking-wide mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-[#d4cfc0] text-[#2d3d34] font-light focus:outline-none focus:border-[#5b7c6f] transition"
                    required
                  />
                </div>

                {message && (
                  <p className={`text-sm font-light ${message.includes('success') || message.includes('email') ? 'text-[#5b7c6f]' : 'text-[#a85b5b]'}`}>
                    {message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 bg-[#5b7c6f] text-[#f5f3ed] font-light tracking-wide hover:bg-[#6b8c7f] transition border border-[#4a6b5e] disabled:opacity-50"
                >
                  {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-[#5b7c6f] hover:text-[#6b8c7f] text-sm font-light tracking-wide"
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

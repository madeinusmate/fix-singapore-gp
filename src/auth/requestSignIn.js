import { createContext, useContext } from 'react'

export const SignInContext = createContext(null)

export const useRequestSignIn = () => {
  const requestSignIn = useContext(SignInContext)
  if (!requestSignIn) throw new Error('Sign-in is not available.')
  return requestSignIn
}

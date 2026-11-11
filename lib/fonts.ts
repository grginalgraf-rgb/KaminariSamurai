import { Shippori_Mincho, Space_Grotesk } from 'next/font/google'

export const serifFont = Shippori_Mincho({
  weight: ['400', '600', '800'],
  subsets: ['latin'],
  variable: '--font-shippori',
  display: 'swap',
})

export const sansFont = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-grotesk',
  display: 'swap',
})

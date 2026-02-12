import type { ReactNode } from 'react'

import config from '@payload-config'
import { RootLayout } from '@payloadcms/next/layouts'
import '@payloadcms/next/css'

import './styles.css'

type Props = {
  children: ReactNode
}

export default function Layout({ children }: Props) {
  return RootLayout({ children, config })
}

import type { Metadata } from 'next'

import config from '@payload-config'
import { generatePageMetadata, RootPage } from '@payloadcms/next/views'

type Props = {
  params: {
    segments?: string[]
  }
  searchParams: {
    [key: string]: string | string[] | undefined
  }
}

export const generateMetadata = ({ params, searchParams }: Props): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams })

export default function Page({ params, searchParams }: Props) {
  return RootPage({ config, params, searchParams })
}

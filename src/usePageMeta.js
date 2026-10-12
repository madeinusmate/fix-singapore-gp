import { useEffect } from 'react'
import { SITE_ORIGIN } from './seo.js'

const setMeta = (attr, key, content) => {
  const selector = `meta[${attr}="${key}"]`
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export const usePageMeta = (meta) => {
  const title = meta?.title
  const socialTitle = meta?.socialTitle
  const description = meta?.description
  const path = meta?.path
  const image = meta?.image
  const imageAlt = meta?.imageAlt
  const robots = meta?.robots
  useEffect(() => {
    if (!title || !path) return undefined
    const social = socialTitle || title
    const url = `${SITE_ORIGIN}${path}`
    document.title = title
    setMeta('name', 'description', description)
    setMeta('name', 'robots', robots)
    setMeta('property', 'og:title', social)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', url)
    setMeta('property', 'og:image', image)
    setMeta('property', 'og:image:secure_url', image)
    setMeta('property', 'og:image:type', 'image/png')
    setMeta('property', 'og:image:width', '1200')
    setMeta('property', 'og:image:height', '630')
    setMeta('property', 'og:image:alt', imageAlt || social)
    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:title', social)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', image)
    setMeta('name', 'twitter:image:alt', imageAlt || social)
    let link = document.head.querySelector('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.setAttribute('rel', 'canonical')
      document.head.appendChild(link)
    }
    link.setAttribute('href', url)
    return undefined
  }, [title, socialTitle, description, path, image, imageAlt, robots])
}

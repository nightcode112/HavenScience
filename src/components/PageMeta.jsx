import { Helmet } from 'react-helmet-async'

export function PageMeta({ 
  title = 'HAVEN - Robot Marketplace', 
  description = 'Discover, trade and manage your digital twin robots on the HAVEN platform. Experience cutting-edge robotics simulation and trading.',
  image = '/assets/Haven-icon-white-Vibrantblue-background.png',
  url = 'https://haven-base.vercel.app'
}) {
  const fullTitle = title.includes('HAVEN') ? title : `${title} | HAVEN`
  
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      
      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      
      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
    </Helmet>
  )
}

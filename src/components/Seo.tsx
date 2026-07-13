import { useEffect } from 'react';
import {
  buildCanonicalUrl,
  DEFAULT_SOCIAL_IMAGE_PATH,
  type JsonLd,
  SITE_NAME,
} from '../lib/seo';

type SeoProps = {
  title: string;
  description: string;
  canonicalPath?: string;
  imagePath?: string;
  keywords?: string[];
  robots?: string;
  jsonLd?: JsonLd;
  jsonLdId?: string;
};

const ensureMetaTag = (selector: string, attributes: Record<string, string>) => {
  let element = document.head.querySelector(selector);
  if (!(element instanceof HTMLMetaElement)) {
    const created = document.createElement('meta');
    Object.entries(attributes).forEach(([key, value]) => {
      created.setAttribute(key, value);
    });
    document.head.appendChild(created);
    element = created;
  }

  return element;
};

const setNamedMeta = (name: string, content: string) => {
  const element = ensureMetaTag(`meta[name="${name}"]`, { name });
  element.setAttribute('content', content);
};

const setPropertyMeta = (property: string, content: string) => {
  const element = ensureMetaTag(`meta[property="${property}"]`, { property });
  element.setAttribute('content', content);
};

const ensureCanonicalLink = () => {
  let element = document.head.querySelector('link[rel="canonical"]');
  if (!(element instanceof HTMLLinkElement)) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }

  return element;
};

const ensureJsonLdScript = (id: string) => {
  const existingElement = document.getElementById(id);
  if (existingElement instanceof HTMLScriptElement) {
    return existingElement;
  }

  const element = document.createElement('script');
  element.id = id;
  element.type = 'application/ld+json';
  document.head.appendChild(element);

  return element;
};

export default function Seo({
  title,
  description,
  canonicalPath,
  imagePath = DEFAULT_SOCIAL_IMAGE_PATH,
  keywords,
  robots = 'index,follow',
  jsonLd,
  jsonLdId = 'app-seo-jsonld',
}: SeoProps) {
  useEffect(() => {
    const canonicalUrl = buildCanonicalUrl(
      canonicalPath || window.location.pathname || '/'
    );
    const imageUrl = buildCanonicalUrl(imagePath);

    document.title = title;

    ensureCanonicalLink().setAttribute('href', canonicalUrl);

    setNamedMeta('description', description);
    setNamedMeta('robots', robots);
    setNamedMeta('twitter:card', 'summary_large_image');
    setNamedMeta('twitter:title', title);
    setNamedMeta('twitter:description', description);
    setNamedMeta('twitter:image', imageUrl);

    if (keywords?.length) {
      setNamedMeta('keywords', keywords.join(', '));
    } else {
      document.head.querySelector('meta[name="keywords"]')?.remove();
    }

    setPropertyMeta('og:locale', 'en_AU');
    setPropertyMeta('og:site_name', SITE_NAME);
    setPropertyMeta('og:type', 'website');
    setPropertyMeta('og:title', title);
    setPropertyMeta('og:description', description);
    setPropertyMeta('og:url', canonicalUrl);
    setPropertyMeta('og:image', imageUrl);

    if (jsonLd) {
      ensureJsonLdScript(jsonLdId).text = JSON.stringify(jsonLd);
    } else {
      document.getElementById(jsonLdId)?.remove();
    }

    return () => {
      if (jsonLd) {
        document.getElementById(jsonLdId)?.remove();
      }
    };
  }, [
    canonicalPath,
    description,
    imagePath,
    jsonLd,
    jsonLdId,
    keywords,
    robots,
    title,
  ]);

  return null;
}

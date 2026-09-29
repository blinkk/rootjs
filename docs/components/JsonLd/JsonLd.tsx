import {JsonLdNode} from '@/utils/structured-data.js';

interface JsonLdProps {
  /** One or more schema.org nodes, rendered together as a single `@graph`. */
  nodes: JsonLdNode[];
}

/**
 * Renders schema.org structured data as a JSON-LD `<script>` tag.
 */
export function JsonLd(props: JsonLdProps) {
  const data = {
    '@context': 'https://schema.org',
    '@graph': props.nodes,
  };
  // Escape `<` so values like `</script>` can't close the tag early.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{__html: json}}
    />
  );
}

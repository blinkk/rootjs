import {RootConfig, RootSecurityConfig} from './config.js';
import {Response} from './types.js';

/**
 * Returns the `security` config value with default values inserted wherever
 * a user config value is blank or set to `true`.
 */
export function getSecurityConfig(
  rootConfig: RootConfig
): Required<RootSecurityConfig> {
  const userConfig: Partial<RootSecurityConfig> =
    rootConfig.server?.security || {};
  const securityConfig: Partial<RootSecurityConfig> = {};

  if (isTrueOrUndefined(userConfig.contentSecurityPolicy)) {
    // CSP default values from:
    // https://csp.withgoogle.com/docs/strict-csp.html
    securityConfig.contentSecurityPolicy = {
      directives: {
        'base-uri': ["'none'"],
        'object-src': ["'none'"],
        // NOTE: nonce is automatically added to this list.
        'script-src': [
          "'unsafe-inline'",
          "'unsafe-eval'",
          "'strict-dynamic' https: http:",
        ],
      },
      reportOnly: true,
    };
  } else {
    securityConfig.contentSecurityPolicy = userConfig.contentSecurityPolicy;
  }

  if (isTrueOrUndefined(userConfig.xFrameOptions)) {
    securityConfig.xFrameOptions = 'SAMEORIGIN';
  } else {
    securityConfig.xFrameOptions = userConfig.xFrameOptions;
  }

  securityConfig.strictTransportSecurity =
    userConfig.strictTransportSecurity ?? true;
  securityConfig.xContentTypeOptions = userConfig.xContentTypeOptions ?? true;
  securityConfig.xXssProtection = userConfig.xXssProtection ?? true;

  return securityConfig as Required<RootSecurityConfig>;
}

/**
 * Sets security-related HTTP headers.
 */
export function setSecurityHeaders(
  res: Response,
  options: {securityConfig: Required<RootSecurityConfig>; nonce?: string}
) {
  const securityConfig = options.securityConfig;

  // Content-Security-Policy.
  const contentSecurityPolicy = securityConfig.contentSecurityPolicy;
  if (typeof contentSecurityPolicy === 'object') {
    // Copy the CSP `directives` value since the `script-src` value will be
    // updated with a `nonce-` value..
    const directives = {...contentSecurityPolicy.directives};
    if (options.nonce) {
      // Create a new array for `script-src` and append a `nonce-` value.
      const scriptSrc = directives['script-src'] || [
        "'unsafe-inline'",
        "'unsafe-eval'",
        "'strict-dynamic' https: http:",
      ];
      const scriptSrcWithNonce = [...scriptSrc, `'nonce-${options.nonce}'`];
      directives['script-src'] = scriptSrcWithNonce;
    }
    const headerSegments: string[] = [];
    Object.entries(directives).forEach(([key, values]) => {
      headerSegments.push([key, ...values].join(' '));
    });
    const csp = headerSegments.join('; ');
    if (contentSecurityPolicy.reportOnly === false) {
      res.setHeader('content-security-policy', csp);
    } else {
      res.setHeader('content-security-policy-report-only', csp);
    }
  }

  // X-Frame-Options.
  if (typeof securityConfig.xFrameOptions === 'string') {
    res.setHeader('x-frame-options', securityConfig.xFrameOptions);
  }

  // Strict-Transport-Security.
  if (securityConfig.strictTransportSecurity) {
    res.setHeader(
      'strict-transport-security',
      'max-age=63072000; includeSubdomains; preload'
    );
  }

  // X-Content-Type-Options.
  if (securityConfig.xContentTypeOptions) {
    res.setHeader('x-content-type-options', 'nosniff');
  }

  // X-XSS-Protection.
  if (securityConfig.xXssProtection) {
    res.setHeader('x-xss-protection', '1; mode=block');
  }
}

function isTrueOrUndefined(value: any) {
  return value === true || value === undefined;
}

# ── Cloudflare DNS ─────────────────────────────────────────────────────────────
data "cloudflare_zone" "main" {
  name = var.cloudflare_zone_name
}

# ── CNAME: subdomain → S3 REST endpoint (supports HTTPS) ─────────────────────
resource "cloudflare_record" "spa" {
  zone_id = data.cloudflare_zone.main.id
  name    = var.cloudflare_subdomain
  type    = "CNAME"
  content = aws_s3_bucket.spa.bucket_regional_domain_name
  proxied = true
  ttl     = 1
}

# ── Cloudflare Worker: SPA routing + S3 host rewrite ─────────────────────────
resource "cloudflare_workers_script" "spa_router" {
  account_id = var.cloudflare_account_id
  name       = "${replace(var.app_name, "-", "_")}_spa_router"
  content    = <<-JS
    const S3_HOST = '${aws_s3_bucket.spa.bucket_regional_domain_name}';
    const S3_ORIGIN = 'https://' + S3_HOST;

    addEventListener('fetch', event => {
      event.respondWith(handleRequest(event.request));
    });

    async function fetchFromS3(pathname) {
      return fetch(S3_ORIGIN + pathname, {
        cf: { resolveOverride: S3_HOST },
        headers: { 'Host': S3_HOST },
      });
    }

    async function handleRequest(request) {
      const url = new URL(request.url);

      // Pass through static assets directly
      if (url.pathname.startsWith('/assets/') ||
          url.pathname === '/favicon.svg' ||
          url.pathname === '/icons.svg') {
        return fetchFromS3(url.pathname);
      }

      // For root or any app route, serve index.html immediately
      // S3 REST endpoint doesn't do directory indexes so we handle it here
      if (url.pathname === '/' || url.pathname === '') {
        const response = await fetchFromS3('/index.html');
        return new Response(response.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      }

      // Try the exact S3 path first
      let response = await fetchFromS3(url.pathname);

      // 403 = no matching S3 object, 404 = key not found — serve index.html
      if (response.status === 403 || response.status === 404) {
        response = await fetchFromS3('/index.html');
        return new Response(response.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
          },
        });
      }

      return response;
    }
  JS
}

# ── Attach Worker to the subdomain route ──────────────────────────────────────
resource "cloudflare_workers_route" "spa_router" {
  zone_id     = data.cloudflare_zone.main.id
  pattern     = "${var.cloudflare_subdomain}.${var.cloudflare_zone_name}/*"
  script_name = cloudflare_workers_script.spa_router.name
}

# ── Cloudflare Page Rule: HTTPS redirect ──────────────────────────────────────
resource "cloudflare_page_rule" "https_redirect" {
  zone_id  = data.cloudflare_zone.main.id
  target   = "http://${var.cloudflare_subdomain}.${var.cloudflare_zone_name}/*"
  priority = 1
  actions {
    always_use_https = true
  }
}

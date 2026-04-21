#!/bin/bash

echo "npm run build ..."
cd ~/github/f5-asean-score-cards/frontend
npm run build

# Inject runtime config
echo ""
echo "Inject runtime config"
sed -i 's|</head>|<script>window.__ENV__={API_URL:"https://4j10a2iuk7.execute-api.ap-southeast-1.amazonaws.com/v1",COGNITO_CLIENT_ID:"5a3vcf65qbof6ul7popqsaav5d"};</script></head>|' dist/index.html

# Deploy everything (assets changed due to rebuild)
echo ""
echo "Deploy everything (assets changed due to rebuild)"
aws s3 sync dist/ s3://f5-asean-score-cards-spa-prod-5ecbdcce/ \
  --delete --exclude "index.html" \
  --cache-control "public,max-age=31536000,immutable" --quiet

aws s3 cp dist/index.html s3://f5-asean-score-cards-spa-prod-5ecbdcce/index.html \
  --cache-control "no-cache,no-store,must-revalidate" --content-type "text/html"

# Purge cache
echo ""
echo "Purge cache"
curl -s -X POST   "https://api.cloudflare.com/client/v4/zones/5fbe28ebf0a1447e7518efcd6eb07efc/purge_cache"   -H "Authorization: Bearer $TF_VAR_cloudflare_api_token"   -H "Content-Type: application/json"   --data '{"purge_everything":true}'   | python3 -m json.tool

echo "Done."

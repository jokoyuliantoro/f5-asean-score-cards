# ── Fill these in before running deploy.sh ────────────────────────────────────
# This file is NOT committed to git (it's in .gitignore).
# Copy this to terraform.tfvars and fill in your values.

aws_region     = "ap-southeast-1"
environment    = "prod"
app_name       = "f5-asean-score-cards"

# The @f5.com address that SES will send OTPs from.
# You must verify this address in SES before first deploy.
ses_from_email = "joko.yuliantoro@gmail.com"

admin_email    = "joko.yuliantoro@gmail.com"

# Keep demo OTP mode on (no SES emails, OTP always 123456)
# Remove when SES sandbox exit is approved
demo_otp_enabled = false

cloudflare_zone_name = "f5-adsp.com"
cloudflare_subdomain = "asean-score-cards"
cloudflare_account_id = "ac7ea0a20fc5741687738b04f3c9e469"


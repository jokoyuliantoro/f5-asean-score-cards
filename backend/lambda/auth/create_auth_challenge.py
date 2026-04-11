import os
import json
import random
import boto3

ses = boto3.client('ses', region_name='ap-southeast-1')

DEMO_OTP          = '123456'
DEMO_OTP_ENABLED  = os.environ.get('DEMO_OTP_ENABLED', 'false').lower() == 'true'
SES_FROM_EMAIL    = os.environ.get('SES_FROM_EMAIL', '')

def lambda_handler(event, context):
    print("EVENT:", json.dumps(event))
    # userName is a UUID; real email is in userAttributes
    email = (event['request']['userAttributes'].get('email') or event['userName'])
    print("EMAIL:", email)

    if DEMO_OTP_ENABLED:
        otp = DEMO_OTP
    else:
        otp = str(random.randint(100000, 999999))

    if not DEMO_OTP_ENABLED:
        _send_otp_email(email, otp)

    event['response']['publicChallengeParameters']  = {'email': email}
    event['response']['privateChallengeParameters'] = {'answer': otp}
    event['response']['challengeMetadata']          = 'OTP_CHALLENGE'

    return event


def _send_otp_email(to_email, otp):
    ses.send_email(
        Source=SES_FROM_EMAIL,
        Destination={'ToAddresses': [to_email]},
        Message={
            'Subject': {'Data': 'Your F5 Scorecard login code'},
            'Body': {
                'Html': {
                    'Data': f'''
                    <div style="font-family:Arial,sans-serif;max-width:400px;margin:40px auto">
                      <div style="background:#CC0000;padding:20px;text-align:center">
                        <span style="color:white;font-size:20px;font-weight:bold">F5 ASEAN Scorecard</span>
                      </div>
                      <div style="padding:30px;border:1px solid #eee">
                        <p style="color:#333">Your one-time login code is:</p>
                        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;
                                    color:#CC0000;text-align:center;padding:20px 0">
                          {otp}
                        </div>
                        <p style="color:#999;font-size:12px">
                          This code expires in 10 minutes.<br>
                          If you did not request this, ignore this email.
                        </p>
                      </div>
                    </div>
                    '''
                }
            },
        }
    )

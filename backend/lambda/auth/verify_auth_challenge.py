import os

DEMO_OTP         = '123456'
DEMO_OTP_ENABLED = os.environ.get('DEMO_OTP_ENABLED', 'false').lower() == 'true'

def lambda_handler(event, context):
    expected = event['request']['privateChallengeParameters']['answer']
    provided = event['request']['challengeAnswer']

    # In demo mode, also accept the fixed OTP
    if DEMO_OTP_ENABLED and provided == DEMO_OTP:
        event['response']['answerCorrect'] = True
    else:
        event['response']['answerCorrect'] = (provided.strip() == expected.strip())

    return event

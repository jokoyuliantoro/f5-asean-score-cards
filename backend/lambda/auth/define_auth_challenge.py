def lambda_handler(event, context):
    session = event['request']['session']

    if len(session) == 0:
        # First call — start the custom challenge
        event['response']['issueTokens']     = False
        event['response']['failAuthentication'] = False
        event['response']['challengeName']   = 'CUSTOM_CHALLENGE'

    elif (len(session) == 1 and
          session[-1]['challengeName'] == 'CUSTOM_CHALLENGE' and
          session[-1]['challengeResult'] is True):
        # Correct OTP — issue tokens
        event['response']['issueTokens']        = True
        event['response']['failAuthentication'] = False

    else:
        # Wrong OTP or too many attempts — fail
        event['response']['issueTokens']        = False
        event['response']['failAuthentication'] = True

    return event

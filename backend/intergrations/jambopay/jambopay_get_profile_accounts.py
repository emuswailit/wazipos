

import requests
from decouple import config
# from intergrations.jambopay.jambopay_generate_token import get_auth_token
import json


def get_jambopay_profile_accounts(phoneNUmber):
    errors=[]
    # token = get_auth_token()
    token =None
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    query_params = json.dumps({"phoneNumber": phoneNUmber, "key2": "value2"})
    result = requests.get(
        config("JAMBOPAY_BASE_URL") + "/wallet/account",
        params=query_params,
        headers=headers,
    )

    profile = result.json()
    if "count" in profile and "data" in profile:
        tenant_accounts=[]
        # print("DATA",profile["data"])
        for account in profile["data"]:
            print("Item ", account)
            print("Item number tenant ", account["tenant"])
            if account["tenant"]["phoneNumber"]=="254722217348":
                tenant_accounts.append(account)
        if len(tenant_accounts)>0:
            return [], tenant_accounts

        else:
            
            return ["No accounts for this profile"],[]

    else:
        if "message" in profile:
            for m in profile["message"]:
                errors.append(m)
                return errors,[]
            



def get_jambopay_main_profile_accounts(phoneNUmber):
    errors=[]
    token = get_auth_token()
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    query_params = {"phoneNumber": phoneNUmber, "key2": "value2"}
    result = requests.get(
        config("JAMBOPAY_BASE_URL") + "/wallet/account",
        params=query_params,
        headers=headers,
    )

    profile = result.json()
    if "count" in profile and "data" in profile:
        tenant_accounts=[]
        # print("DATA",profile["data"])
        for account in profile["data"]:
            print("Item ", account)
            print("Item number tenant ", account["tenant"])
            if account["tenant"]["firstName"]=="Jambopay":
                tenant_accounts.append(account)
                print("Tenant")
        if len(tenant_accounts)>0:
            return [], tenant_accounts

        else:
            
            return ["No accounts for this profile"],[]

    else:
        if "message" in profile:
            for m in profile["message"]:
                errors.append(m)
                return errors,[]
            
def get_jambopay_main_profile(phoneNUmber):
    print("PPPPPPPPP AT CHECK", phoneNUmber)
    errors=[]
    token = get_auth_token()
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": "Bearer " + token,
    }
    query_params = {"phoneNumber": phoneNUmber, "key2": "value2"}
    result = requests.get(
        config("JAMBOPAY_BASE_URL") + "/wallet/account",
        params=query_params,
        headers=headers,
    )

    profile = result.json()
    if "count" in profile and "data" in profile:
        tenant_accounts=[]
        account = profile["data"][0]["profile"]
        print("Acc", account)
        # print("DATA",profile["data"])
        # for account in profile["data"]:
        #     print("Item ", account)
        #     print("Item number tenant ", account["tenant"])
        #     if account["tenant"]["firstName"]=="Jambopay":
        #         tenant_accounts.append(account)
        #         print("Tenant")
        # if len(tenant_accounts)>0:
        #     return [], tenant_accounts

        # else:
            
        #     return ["No accounts for this profile"],[]
        return [], profile

    else:
        if "message" in profile:
            for m in profile["message"]:
                errors.append(m)
                return errors, None
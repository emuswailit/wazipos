from rest_framework import exceptions


def solve(self, words):
    s = "".join(word[0].upper() + word[1:].lower() for word in words)
    return s[0].lower() + s[1:]


def raise_custom_exception(errors):
    if len(errors) > 0:
        raise exceptions.ValidationError(errors)
    else:
        return


def get_user_roles_stringified(roles):
    roles_array = []
    if len(roles) < 1:
        return False
    else:
        for role in roles:
            roles_array.append(role.value)

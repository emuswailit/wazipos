# authentication/utils/agent_utils.py
#
# Legacy "CreateAgent" action. The rules now live in authentication/utils/agents.py
# (commission, reactivation, the Agent role is added to the token on login).


def create_agent(data, user):
    from authentication.utils.agents import save_agent

    if "commission_percentage" not in data:
        data = {**data, "commission_percentage": 0}
    return save_agent({k: v for k, v in data.items() if k != "agent"}, user)

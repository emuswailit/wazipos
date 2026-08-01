from ..models import Agents,Entities, Users,Roles
def create_agent(data,user):
    try:
        errors =[]
        agent_user =None
        default_entity = Entities.objects.filter(entity_type="DEFAULT").first()
        if not "user" in data or data["user"]=="":
            errors.append("User ID is required")
            return errors, None
        else:
            if Users.objects.filter(id=data["user"]).exists():
                agent_user =  Users.objects.filter(id=data["user"]).first()
            else:
                errors.append("User with provided ID does not exist")
                return errors, None
            
        created = Agents.objects.create(entity=default_entity,user=agent_user, is_active=True, is_approved=True,  owner=user)
        if created:
            agent_role = Roles.objects.filter(title="AGENT").first()
            user.roles.add(agent_role)
            return errors, created
        else:
            errors.append("Agent not created")
        
    except Exception as e:
        errors.append(str(e))
        return errors, None
import json
from symtable import Function
from channels.generic.websocket import AsyncWebsocketConsumer,JsonWebsocketConsumer,WebsocketConsumer
from asgiref.sync import async_to_sync
from asgiref.sync import sync_to_async
from channels.db import database_sync_to_async
from authentication.models import Users,Entities,Agents
from transport.serializers import SaccoPersonnelSerializer
from authentication.serializers import UsersSerializer,EntitySerializer
from django.db.models import Q

from uuid import UUID
import asyncio

class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            # if the obj is uuid, we simply return the value of uuid
            return obj.hex
        return json.JSONEncoder.default(self, obj)

import asyncio
import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer




class AgentUsersConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'agent-users',
            self.channel_name
        )
        await self.accept()
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'agent_users': json.loads(self.datum),
                    
                })

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'agent-users',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        agent=None
        agent_users = []
        if Agents.objects.filter(user=self.user,is_active=True).exists():
            agent = Agents.objects.filter(user=self.user,is_active=True).first()
            agent_users = Users.objects.filter(creating_agent=agent,is_active=True)
        # print("qsw",os_items)
        # for item in os_items:
            # print("idem",item)
        self.agent_users = agent_users
        agent_users_serializer =UsersSerializer(agent_users,many=True,context={'request': None}).data
        data=json.dumps(agent_users_serializer,cls=UUIDEncoder)
        # print("Data as s2s",data)
        self.datum=data


    async def send_agent_users(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'agent_users': json.loads(self.datum),
                    
                })
        


class AgentEntitiesConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'agent-entities',
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'agent-entities',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        agent = None
        
        agent_entities=[]
        if Agents.objects.filter(user=self.user,is_active=True).exists():
            agent = Agents.objects.filter(user=self.user,is_active=True).first()
            agent_entities =  Entities.objects.filter(
            Q(title__iexact="WAZIPOS") | Q(agent=agent)
           
        )
        # print("qsw",os_items)
        # for item in os_items:
            # print("idem",item)
        self.agent_entities = agent_entities
        agent_users_serializer =EntitySerializer(agent_entities,many=True,context={'request': None}).data
        data=json.dumps(agent_users_serializer,cls=UUIDEncoder)
        # print("Data as s2s",data)
        self.datum=data


    async def send_agent_entities(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'agent_entities': json.loads(self.datum),
                    
                })


class ClientEntitiesConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'client-entities',
            self.channel_name
        )
        
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'client-entities',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        client_entities=[]
        client_entities = Entities.objects.filter(owner=self.user,is_active=True)

        self.client_entities = client_entities
        client_entities_serializer =EntitySerializer(client_entities,many=True,context={'request': None}).data
        data=json.dumps(client_entities_serializer,cls=UUIDEncoder)
        print("Data as s2s",data)
        self.datum=data


    async def send_client_entities(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'client_entities': json.loads(self.datum),
                    
                })
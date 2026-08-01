import json
from asgiref.sync import sync_to_async
from transport.models import SaccoPersonnel,Vehicles,BodabodaTrips
from transport import serializers
from authentication.models import Agents
from djangochannelsrestframework.generics import GenericAsyncAPIConsumer
from djangochannelsrestframework.observer import model_observer
from djangochannelsrestframework.decorators import action
from djangochannelsrestframework.mixins import ListModelMixin
from djangochannelsrestframework import permissions
import logging
from channels.generic.websocket import WebsocketConsumer
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
from core.date_utils import get_formatted_from_date, get_formatted_to_date

from uuid import UUID


class UUIDEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, UUID):
            # if the obj is uuid, we simply return the value of uuid
            return obj.hex
        return json.JSONEncoder.default(self, obj)

import asyncio
import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger("transport.consumers")



class AgentSaccoPersonnelConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'agent-sacco-personnel',
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'agent-sacco-personnel',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        agent =None
        agent_sacco_pers=[]
        if Agents.objects.filter(user=self.user,is_active=True).exists():
            agent = Agents.objects.filter(user=self.user,is_active=True).first()
            agent_sacco_pers = SaccoPersonnel.objects.filter(agent=agent,is_active="true")
        # print("qsw",os_items)
        # for item in os_items:
            # print("idem",item)
        self.agent_sacco_pers = agent_sacco_pers
        sacco_pers_serializer =serializers.SaccoPersonnelSerializer(agent_sacco_pers,many=True,context={'request': None}).data
        data=json.dumps(sacco_pers_serializer,cls=UUIDEncoder)
        # print("Data as s2s",data)
        self.datum=data


    async def send_agent_sacco_personnel(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'agent_sacco_personnel': json.loads(self.datum),
                    
                })
        

class AgentVehiclesConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'agent-vehicles',
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'agent-vehicles',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        agent = None
        agent_vehicles=[]
        if Agents.objects.filter(user=self.user,is_active=True).exists():
            agent = Agents.objects.filter(user=self.user,is_active=True).first()
            agent_vehicles = Vehicles.objects.filter(agent=agent,is_active=True)

        
        # agent_vehicles = Vehicles.objects.filter(owner=self.user)
        # print("qsw",os_items)
        # for item in os_items:
            # print("idem",item)
        self.agent_vehicles = agent_vehicles
        sacco_pers_serializer =serializers.VehiclesSerializer(agent_vehicles,many=True,context={'request': None}).data
        data=json.dumps(sacco_pers_serializer,cls=UUIDEncoder)
        # print("Data as s2s",data)
        self.datum=data


    async def send_agent_vehicles(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'agent_vehicles': json.loads(self.datum),
                    
                })
        

class SaccoPersonnelTripsConsumer(AsyncJsonWebsocketConsumer):
    
    async def connect(self):
        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            return
        
        await self.channel_layer.group_add(
            f'sacco-personnel-trips',
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            'sacco-personnel-trips',
            self.channel_name
        )
        await self.close()

    @sync_to_async
    def helper_func(self):
        sacco_personnel = None
        sacco_per_trips=[]
        data=None
        
        if SaccoPersonnel.objects.filter(user=self.user).exists():
            sacco_personnel =SaccoPersonnel.objects.filter(user=self.user).first()
        if sacco_personnel:
            if BodabodaTrips.objects.filter(boda=sacco_personnel,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).exists():
                sacco_per_trips = BodabodaTrips.objects.filter(boda=sacco_personnel,created__gte=get_formatted_from_date(data), created__lte=get_formatted_to_date(data)).all()
        
        self.sacco_per_trips = sacco_per_trips
        sacco_pers_serializer =serializers.BodabodaTripsSerializer(sacco_per_trips,many=True,context={'request': None}).data
        data=json.dumps(sacco_pers_serializer,cls=UUIDEncoder)
        # print("Data as s2s",data)
        self.datum=data


    async def send_sacco_personnel_trips(self, event):
        # Call the heper async Function
        await self.helper_func()

        # Broadcast result to the group
        await self.send_json({
                    'sacco-personnel-trips': json.loads(self.datum),
                    
                })
        

class BodabodaTripsConsumer(WebsocketConsumer):
    def connect(self):
        user = self.scope["user"]
        print("User at connect", f"{user}")
        if user.is_authenticated:
            self.group_name = f"user_{user.id}"
            async_to_sync(self.channel_layer.group_add)(
                self.group_name, self.channel_name
            )
            self.accept()
        else:
            self.close()

    def disconnect(self, close_code):
        if hasattr(self, "group_name"):
            print("Disconnecting from group", self.group_name)
            print("Channel name", self.channel_name)

            async_to_sync(self.channel_layer.group_discard)(
                self.group_name, self.channel_name
            )

    def send_notification(self, event):

        is_accepted = event["is_accepted"]
        is_declined = event["is_declined"]
        is_cancelled = event["is_cancelled"]
        is_started = event["is_started"]
        is_completed = event["is_completed"]
        is_delivery = event["is_delivery"]
        adults = event["adults"]
        children = event["children"]
        destination = event["destination"]
        origin = event["origin"]
        fare = event["fare"]
        owner = event["owner"]
        boda = event["boda"]
        boda_user = event["boda_user"]
        distance = event["distance"]


        id = event["id"]
        self.send(text_data=json.dumps({
           "is_accepted": is_accepted,
           "is_declined": is_declined,
           "is_cancelled": is_cancelled,
           "is_delivery": is_delivery,
           "is_started": is_started,
           "is_completed": is_completed,
           "owner": owner,
           "adults": adults,
           "children": children,
           "destination": destination,
           "origin": origin,
           "distance": distance,
           "fare": fare,
           "boda": boda,
           "boda_user": boda_user,
           "id": id,    
      
        }))



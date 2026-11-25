# churches/views.py
#
# POST /api/v1/churches/   (signed in)
#   Everyone:        FindChurches {q?, latitude?, longitude?, page?} · ChurchPage {church_id | code}
#                    MyChurches · MyFamily {church_id?}
#   Church officials (owner / super admin / pastor / secretary / treasurer / welfare / group leader),
#   every action takes an optional {church} (default: the church you're signed in to, else your first):
#                    AdminHome · SaveSettings {denomination?, about?, is_listed?}
#                    Families {q?, status?, cell_group?, page?} · Family {family_id}
#                    SaveFamily {family_id?, name, area?, cell_group_id?, joined_on?, notes?, status?, head?: {member fields}}
#                    Members {q?, status?, group_id?, family_id?, gender?, page?} · Member {member_id}
#                    SaveMember {member_id? | family_id, first_name, last_name?, gender?, date_of_birth?, phone?, id_number?,
#                                role_in_family?, status?, baptised_on?, confirmed_on?, married_on?, notes?, group_ids?}
#                    PromoteMember {member_id, mode: NEW_FAMILY | JOIN_FAMILY, family_id?, family_name?, area?, married_on?, spouse?}
#                    SetMemberStatus {member_id, status, date?, note?} · RemoveMember {member_id}
#                    Groups {active?} · SaveGroup {group_id?, name, kind?, description?, meets?, is_active?}
#                    SetGroupMembers {group_id, add?: [member ids], remove?: [member ids]}
#                    Officials · SaveOfficial {phone, office, group_id?} · RemoveOfficial {official_id}
#                    Announcements {show?} · SaveAnnouncement {announcement_id?, title, body, audience?, pinned?, publish_at?, expires_at?}
#                    DeleteAnnouncement {announcement_id}
#                    Schedule {show?} · SaveScheduleItem {item_id?, day, starts, ends?, title, venue?, notes?, group_id?, is_active?}
#                    DeleteScheduleItem {item_id}
#                    Events {when?: UPCOMING | PAST | ALL} · SaveEvent {event_id?, title, starts_at, ends_at?, venue?, description?, leader?,
#                                audience?, group_id?, is_cancelled?} · DeleteEvent {event_id}
#                    SmsPreview {audience, message?} · SendSms {audience, message} · SmsLog
#   audience = {kind: ALL | HEADS | GROUP | FAMILY | AGE | GENDER, group_id?, family_id?, min_age?, max_age?, gender?, include_visitors?}
#
# POST /api/v1/churches/public   (no sign-in) PublicChurch {code}: a shared church link.

import logging

from django.http import JsonResponse
from rest_framework import exceptions, permissions
from rest_framework.decorators import api_view, permission_classes, renderer_classes, throttle_classes
from rest_framework.renderers import JSONRenderer
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

from core.responses import custom_errors_response, custom_success_message
from churches import services as church

log = logging.getLogger(__name__)


class ChurchThrottle(UserRateThrottle):
    rate = "240/min"


class PublicChurchThrottle(AnonRateThrottle):
    rate = "60/min"


def _run(action, user, fn, message, key):
    try:
        return custom_success_message(0, message, fn(), key)
    except church.ChurchError as e:
        return custom_errors_response(1, e.message, e.errors)
    except exceptions.ValidationError as e:
        detail = e.detail if isinstance(e.detail, list) else [str(e.detail)]
        return custom_errors_response(1, "Check the details", [str(d) for d in detail])
    except Exception as e:  # noqa: BLE001 — last line of defence
        log.exception("churches %s failed for %s", action, getattr(user, "pk", None))
        try:
            from utils.logging import create_log

            create_log("error", f"Churches {action} failed: {e}")
        except Exception:
            pass
        return JsonResponse({"response_code": 1, "response_message": "Server problem", "errors": ["Something went wrong on our side. Please try again shortly."]}, status=500)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@renderer_classes([JSONRenderer])
@throttle_classes([ChurchThrottle])
def churchAPIView(request):
    data = request.data if hasattr(request.data, "get") else {}
    user = request.user
    action = data.get("action")
    if not action:
        return custom_errors_response(1, "Check the details", ["Action is not supplied"])
    routes = {
        # everyone
        "FindChurches": (lambda: church.find_churches(user, data), "Churches", "result"),
        "ChurchPage": (lambda: church.church_page(user, data), "Church", "page"),
        "MyChurches": (lambda: church.my_churches(user, data), "My churches", "result"),
        "MyFamily": (lambda: church.my_family(user, data), "My family", "family"),
        # officials
        "AdminHome": (lambda: church.admin_home(user, data), "Church", "home"),
        "SaveSettings": (lambda: church.save_settings(user, data), "Church details saved", "church"),
        "Families": (lambda: church.families(user, data), "Families", "result"),
        "Family": (lambda: church.family(user, data), "Family", "family"),
        "SaveFamily": (lambda: church.save_family(user, data), "Family saved", "family"),
        "Members": (lambda: church.members(user, data), "Members", "result"),
        "Member": (lambda: church.member(user, data), "Member", "member"),
        "SaveMember": (lambda: church.save_member(user, data), "Member saved", "member"),
        "PromoteMember": (lambda: church.promote_member(user, data), "Family updated", "family"),
        "SetMemberStatus": (lambda: church.set_member_status(user, data), "Member updated", "member"),
        "RemoveMember": (lambda: church.remove_member(user, data), "Member removed", "result"),
        "Groups": (lambda: church.groups(user, data), "Groups", "result"),
        "SaveGroup": (lambda: church.save_group(user, data), "Group saved", "group"),
        "SetGroupMembers": (lambda: church.set_group_members(user, data), "Group members updated", "group"),
        "Officials": (lambda: church.officials(user, data), "Officials", "result"),
        "SaveOfficial": (lambda: church.save_official(user, data), "Official added. They see the Church admin menu after signing in again.", "result"),
        "RemoveOfficial": (lambda: church.remove_official(user, data), "Official removed", "result"),
        "Announcements": (lambda: church.announcements(user, data), "Announcements", "result"),
        "SaveAnnouncement": (lambda: church.save_announcement(user, data), "Announcement saved", "announcement"),
        "DeleteAnnouncement": (lambda: church.delete_announcement(user, data), "Announcement removed", "result"),
        "Schedule": (lambda: church.schedule(user, data), "Weekly programme", "result"),
        "SaveScheduleItem": (lambda: church.save_schedule_item(user, data), "Programme saved", "item"),
        "DeleteScheduleItem": (lambda: church.delete_schedule_item(user, data), "Removed from the programme", "result"),
        "Events": (lambda: church.events(user, data), "Events", "result"),
        "SaveEvent": (lambda: church.save_event(user, data), "Event saved", "event"),
        "DeleteEvent": (lambda: church.delete_event(user, data), "Event removed", "result"),
        "SmsPreview": (lambda: church.sms_preview(user, data), "Recipients", "preview"),
        "SendSms": (lambda: church.send_sms(user, data), "Sending your message", "message"),
        "SmsLog": (lambda: church.sms_log(user, data), "Sent messages", "result"),
    }
    route = routes.get(str(action))
    if not route:
        return custom_errors_response(1, "Check the details", [f"Unknown action '{action}'"])
    fn, message, key = route
    return _run(action, user, fn, message, key)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@renderer_classes([JSONRenderer])
@throttle_classes([PublicChurchThrottle])
def publicChurchAPIView(request):
    data = request.data if hasattr(request.data, "get") else {}
    if data.get("action") != "PublicChurch":
        return custom_errors_response(1, "Check the details", [f"Unknown action '{data.get('action')}'"])
    return _run("PublicChurch", None, lambda: church.public_church(data), "Church", "page")

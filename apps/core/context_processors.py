from .models import ChurchSettings


def church_settings(request):
    return {"church_settings": ChurchSettings.get()}

from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from django.views.static import serve

FRONTEND_DIR = settings.BASE_DIR.parent / 'frontend'


def frontend_index(request):
    return serve(request, 'index.html', document_root=FRONTEND_DIR)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('typing_app.urls')),
]

if settings.DEBUG:
    urlpatterns += [
        path('', frontend_index),
        path('<path:path>', serve, {'document_root': FRONTEND_DIR}),
    ]

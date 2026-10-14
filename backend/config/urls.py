from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('assessments.urls')),
]

# Patient images are served only by authenticated API/admin views.

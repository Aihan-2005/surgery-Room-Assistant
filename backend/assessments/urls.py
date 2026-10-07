from django.urls import path
from . import views

urlpatterns = [
    path("devices/register/", views.RegisterView.as_view()),
    path("assessments/", views.AssessmentListView.as_view()),
    path("assessments/<uuid:pk>/", views.AssessmentDetailView.as_view()),
    path("assessments/<uuid:pk>/photos/<uuid:photo_id>/", views.PhotoUploadView.as_view()),
    path("assessments/<uuid:pk>/complete/", views.CompleteView.as_view()),
]
from django.urls import path

from . import views

app_name = 'typing_app'

urlpatterns = [
    path('text/random/', views.random_text, name='random_text'),
    path('results/', views.save_result, name='save_result'),
    path('stats/', views.stats_summary, name='stats_summary'),
]

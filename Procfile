release: python manage.py collectstatic --noinput && python manage.py migrate && python manage.py create_default_superuser
web: gunicorn gracedesk.wsgi --bind 0.0.0.0:$PORT

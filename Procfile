release: python manage.py collectstatic --noinput && python manage.py migrate
web: gunicorn gracedesk.wsgi --bind 0.0.0.0:$PORT

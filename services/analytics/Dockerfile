FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home analytics && mkdir /data && chown analytics:analytics /data
COPY server.py dashboard.html dashboard.css dashboard.js ./
USER analytics
ENV ANALYTICS_DATABASE=/data/analytics.sqlite3
EXPOSE 8787
CMD ["gunicorn", "--bind", "0.0.0.0:8787", "--workers", "2", "--threads", "4", "--timeout", "30", "server:create_app()"]

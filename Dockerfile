FROM python:3.11.3-slim-buster

ENV TOKEN=none
ENV MONGODB_URI=none
ENV TEXTGEN_API_URL=none

WORKDIR /app
COPY . .

RUN pip install -r requirements.txt

CMD ["python", "main.py"]
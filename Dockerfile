FROM python:3.11.3-slim-buster

ENV TOKEN=none
ENV MONGODB_URI=none
ENV OPENAI_API_KEY=none
ENV OPENAI_ORG_ID=none

WORKDIR /app
COPY . .

RUN pip install -r requirements.txt

CMD ["python", "main.py"]
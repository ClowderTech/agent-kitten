FROM python:3.12.3-bookworm

ENV TOKEN=none
ENV MONGODB_URI=none
ENV OPENAI_API_KEY=none
ENV OPENAI_ORG_ID=none

WORKDIR /app
COPY . /app

RUN pip3 install --no-cache-dir -r requirements.txt --upgrade

CMD ["python3", "main.py"]
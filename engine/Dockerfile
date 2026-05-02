FROM ghcr.io/osgeo/gdal:ubuntu-small-3.8.4

RUN apt-get update && apt-get install -y \
    python3-pip \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --upgrade pip

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt
COPY . .

CMD uvicorn main:app --host 0.0.0.0 --port $PORT

#!/bin/bash
# Runs on the vast.ai instance at boot. Generates assets, uploads them to the S3 relay, then destroys the instance.
cd /root
export DEBIAN_FRONTEND=noninteractive HF_HUB_ENABLE_HF_TRANSFER=1 PYTHONUNBUFFERED=1
INSTANCE_ID="${VAST_CONTAINERLABEL#C.}"
{
  echo "== $(date -u) start on $(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader)"
  pip install -q "diffusers>=0.32" "transformers>=4.46" accelerate sentencepiece protobuf pillow numpy boto3 "huggingface_hub[hf_transfer]" 2>&1 | tail -3
  cat > generate.py <<'PY'
__GENERATE_PY__
PY
  python generate.py
  echo "== $(date -u) exit $?"
} > log.txt 2>&1
python - <<'P'
import boto3, os
from botocore.config import Config
s3 = boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT"], region_name=os.environ.get("S3_REGION","auto"), aws_access_key_id=os.environ["S3_KEY"], aws_secret_access_key=os.environ["S3_SECRET"], config=Config(signature_version="s3v4", s3={"addressing_style": os.environ.get("S3_STYLE","path")}))
s3.upload_file("log.txt", os.environ["S3_BUCKET"], os.environ["S3_PREFIX"] + "/log.txt")
P
if [ "${KEEP:-0}" != "1" ] && [ -n "$INSTANCE_ID" ]; then
  sleep 5
  curl -s -X DELETE -H "Authorization: Bearer $VAST_API_KEY" "https://console.vast.ai/api/v0/instances/${INSTANCE_ID}/"
fi

#!/usr/bin/env python3
"""Exercise one simulated order on the seeded exam ALB; never print auth tokens."""
import argparse
import json
import re
import uuid
from urllib.error import HTTPError
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('url')
parser.add_argument('--create-demo-order', action='store_true', required=True)
args = parser.parse_args()
base = args.url.rstrip('/')
if not re.fullmatch(r'http://smartcanteen-exam-[0-9]+\.ap-south-1\.elb\.amazonaws\.com', base):
    parser.error('Use the Mumbai smartcanteen-exam ALB URL')


def api(path, method='GET', body=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    request = Request(base + '/api' + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
    try:
        with urlopen(request, timeout=30) as response:
            result = json.load(response)
    except HTTPError as error:
        raise SystemExit(f'{method} {path} failed: HTTP {error.code}') from None
    if result.get('success') is False:
        raise SystemExit(f'{method} {path} failed')
    return result.get('data', result)


with urlopen(base + '/env-config.js', timeout=30) as response:
    config = response.read().decode()
if not re.search(r'"VITE_PAYMENT_MODE"\s*:\s*"fake"', config):
    raise SystemExit('Frontend is not configured for fake payments')
assert api('/ready')['status'] == 'ready'
customer = api('/auth/login', 'POST', {'email': 'student.alpha@smartcanteen.com', 'password': 'Customer@123'})['accessToken']
manager = api('/auth/login', 'POST', {'email': 'manager.alpha@smartcanteen.com', 'password': 'Manager@123'})['accessToken']
print('Customer and manager login passed.')
menu = api('/customer/menu', token=customer)
item = next(item for item in menu if item['isAvailable'] and item['stockQuantity'] > 0)
items = [{'menuItemId': item['id'], 'quantity': 1}]
api('/customer/cart', 'PUT', {'items': items}, customer)
assert api('/customer/cart', token=customer) == items
print('Shared cart write/read passed.')
order = api('/customer/orders', 'POST', {'canteenId': item['canteenId'], 'items': items}, customer)
order_id = order['id']
payment = api(f'/customer/orders/{order_id}/payments/initiate', 'POST', {'idempotencyKey': str(uuid.uuid4())}, customer)
assert payment['providerOrderId'].startswith('exam_order_')
api('/customer/payments/verify', 'POST', {'providerOrderId': payment['providerOrderId'], 'providerPaymentId': f'exam_pay_{uuid.uuid4()}', 'signature': 'exam_fake_payment'}, customer)
qr = api(f'/customer/orders/{order_id}/qr', token=customer)
api('/manager/orders/scan-qr', 'POST', {'signedToken': qr['signedToken']}, manager)
for state in ['PREPARING', 'READY', 'COMPLETED']:
    api(f'/manager/orders/{order_id}/status', 'PATCH', {'nextStatus': state}, manager)
orders = api('/customer/orders', token=customer)
assert next(order for order in orders if order['id'] == order_id)['status'] == 'COMPLETED'
api('/customer/cart', 'DELETE', token=customer)
print(f'PASS: order {order_id} completed through fake payment, QR confirmation, and fulfillment. No real money charged.')

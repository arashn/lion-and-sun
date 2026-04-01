#!/usr/bin/env python3

import argparse
import csv
import io
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, Iterable, List, Optional


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env_file(path: str) -> Dict[str, str]:
    values: Dict[str, str] = {}
    if not os.path.exists(path):
        return values

    with open(path, "r", encoding="utf-8") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()

            if (
                len(value) >= 2
                and ((value[0] == value[-1] == '"') or (value[0] == value[-1] == "'"))
            ):
                value = value[1:-1]

            values[key] = value

    return values


def get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    if name in os.environ:
        return os.environ[name]

    for filename in (".env", ".env.example"):
        path = os.path.join(ROOT_DIR, filename)
        values = load_env_file(path)
        if name in values:
            return values[name]

    return default


def stripe_request(
    stripe_secret_key: str, path: str, query_items: Optional[List[tuple[str, str]]] = None
) -> Dict[str, object]:
    query = urllib.parse.urlencode(query_items or [])
    url = f"https://api.stripe.com{path}"
    if query:
        url = f"{url}?{query}"

    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {stripe_secret_key}",
            "Accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(body)
            message = payload.get("error", {}).get("message") or body
        except json.JSONDecodeError:
            message = body
        raise RuntimeError(f"Stripe request failed for {path}: {message}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Stripe request failed for {path}: {error.reason}") from error


def fetch_livestream_payment_map(database_url: str) -> Dict[str, Dict[str, str]]:
    query = """
        SELECT
          tp.stripe_session_id AS payment_intent_id,
          tu.phone AS customer_phone
        FROM twilio_purchases tp
        INNER JOIN twilio_users tu ON tu.id = tp.user_id
        WHERE tp.stripe_session_id LIKE 'pi_%'
    """.strip()

    result = subprocess.run(
        ["psql", database_url, "--csv", "-c", query],
        check=False,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "psql query failed")

    reader = csv.DictReader(io.StringIO(result.stdout))
    return {
        (row.get("payment_intent_id") or "").strip(): {
            "customer_phone": row.get("customer_phone", ""),
            "source": "livestream",
        }
        for row in reader
        if (row.get("payment_intent_id") or "").strip()
    }


def fetch_all_payment_intents(
    stripe_secret_key: str, limit: Optional[int]
) -> List[Dict[str, object]]:
    payment_intents: List[Dict[str, object]] = []
    starting_after: Optional[str] = None

    while True:
        page_limit = 100
        if limit is not None:
            remaining = limit - len(payment_intents)
            if remaining <= 0:
                break
            page_limit = min(page_limit, remaining)

        query_items = [
            ("limit", str(page_limit)),
            ("expand[]", "data.customer"),
            ("expand[]", "data.payment_method"),
            ("expand[]", "data.latest_charge"),
        ]
        if starting_after:
            query_items.append(("starting_after", starting_after))

        payload = stripe_request(
            stripe_secret_key,
            "/v1/payment_intents",
            query_items=query_items,
        )
        data = payload.get("data")
        if not isinstance(data, list):
            raise RuntimeError("Stripe payment intent list response was not a list")

        page_items = [item for item in data if isinstance(item, dict)]
        payment_intents.extend(page_items)

        if not payload.get("has_more") or not page_items:
            break

        last_id = page_items[-1].get("id")
        if not isinstance(last_id, str) or not last_id:
            break
        starting_after = last_id

    return payment_intents


def as_dict(value: object) -> Dict[str, object]:
    return value if isinstance(value, dict) else {}


def first_non_empty(*values: object) -> str:
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def format_amount(amount_cents: object) -> str:
    try:
        cents = int(amount_cents)
    except (TypeError, ValueError):
        return str(amount_cents or "")
    return f"${cents / 100:,.2f}"


def truncate(value: str, width: int) -> str:
    if len(value) <= width:
        return value
    if width <= 3:
        return value[:width]
    return value[: width - 3] + "..."


def extract_stripe_fields(payment_intent: Dict[str, object]) -> Dict[str, str]:
    customer = as_dict(payment_intent.get("customer"))
    payment_method = as_dict(payment_intent.get("payment_method"))
    billing_details = as_dict(payment_method.get("billing_details"))
    card = as_dict(payment_method.get("card"))
    shipping = as_dict(payment_intent.get("shipping"))
    latest_charge = as_dict(payment_intent.get("latest_charge"))
    charge_billing_details = as_dict(latest_charge.get("billing_details"))
    customer_address = as_dict(customer.get("address"))
    shipping_address = as_dict(shipping.get("address"))
    billing_address = as_dict(billing_details.get("address"))
    charge_billing_address = as_dict(charge_billing_details.get("address"))

    customer_name = first_non_empty(
        billing_details.get("name"),
        charge_billing_details.get("name"),
        shipping.get("name"),
        customer.get("name"),
    )
    customer_email = first_non_empty(
        billing_details.get("email"),
        charge_billing_details.get("email"),
        payment_intent.get("receipt_email"),
        customer.get("email"),
    )

    return {
        "customer_name": customer_name,
        "customer_email": customer_email,
        "payment_method_owner_email": first_non_empty(
            billing_details.get("email"),
            charge_billing_details.get("email"),
        ),
        "country": first_non_empty(
            card.get("country"),
            billing_address.get("country"),
            charge_billing_address.get("country"),
            shipping_address.get("country"),
            customer_address.get("country"),
        ),
        "stripe_customer_id": first_non_empty(
            customer.get("id") if isinstance(payment_intent.get("customer"), dict) else payment_intent.get("customer")
        ),
    }


def build_report_rows(
    payment_intents: Iterable[Dict[str, object]],
    livestream_map: Dict[str, Dict[str, str]],
) -> List[Dict[str, str]]:
    report_rows: List[Dict[str, str]] = []

    for payment_intent in payment_intents:
        if payment_intent.get("status") != "succeeded":
            continue

        payment_intent_id = str(payment_intent.get("id") or "").strip()
        if not payment_intent_id:
            continue

        amount_cents = payment_intent.get("amount_received") or payment_intent.get("amount") or 0
        livestream_row = livestream_map.get(payment_intent_id, {})
        stripe_fields = extract_stripe_fields(payment_intent)

        row = {
            "payment_intent_id": payment_intent_id,
            "source": livestream_row.get("source", "payment link"),
            "amount": format_amount(amount_cents),
            "amount_cents": str(amount_cents),
            "customer_phone": livestream_row.get("customer_phone", ""),
            "customer_name": stripe_fields["customer_name"],
            "customer_email": stripe_fields["customer_email"],
            "payment_method_owner_email": stripe_fields["payment_method_owner_email"],
            "country": stripe_fields["country"],
            "stripe_customer_id": stripe_fields["stripe_customer_id"],
            "lookup_status": "ok",
        }
        report_rows.append(row)

    return report_rows


def render_table(rows: List[Dict[str, str]]) -> str:
    columns = [
        ("payment_intent_id", "PaymentIntent ID"),
        ("source", "Source"),
        ("amount", "Amount"),
        ("customer_phone", "Twilio Phone"),
        ("customer_name", "Customer Name"),
        ("customer_email", "Customer Email"),
        ("payment_method_owner_email", "PM Owner Email"),
        ("country", "Country"),
    ]
    max_widths = {
        "payment_intent_id": 36,
        "source": 14,
        "amount": 12,
        "customer_phone": 18,
        "customer_name": 28,
        "customer_email": 32,
        "payment_method_owner_email": 32,
        "country": 12,
    }

    widths = {}
    for key, label in columns:
        cell_width = max(
            [len(label)] + [len(str(row.get(key, ""))) for row in rows] if rows else [len(label)]
        )
        widths[key] = min(max_widths[key], cell_width)

    header = " | ".join(truncate(label, widths[key]).ljust(widths[key]) for key, label in columns)
    divider = "-+-".join("-" * widths[key] for key, _label in columns)
    body = [
        " | ".join(
            truncate(str(row.get(key, "")), widths[key]).ljust(widths[key]) for key, _label in columns
        )
        for row in rows
    ]
    return "\n".join([header, divider] + body)


def write_csv(rows: List[Dict[str, str]], output_path: str) -> None:
    columns = [
        ("source", "Source"),
        ("amount", "Amount"),
        ("customer_phone", "Twilio Phone"),
        ("customer_name", "Customer Name"),
        ("customer_email", "Customer Email"),
        ("payment_method_owner_email", "PM Owner Email"),
        ("country", "Country"),
    ]

    with open(output_path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([label for _key, label in columns])
        for row in rows:
            writer.writerow([row.get(key, "") for key, _label in columns])


def summarize_rows(rows: Iterable[Dict[str, str]]) -> Dict[str, str]:
    row_list = list(rows)
    contributor_keys = set()
    total_amount_cents = 0

    for row in row_list:
        contributor_key = first_non_empty(
            row.get("customer_phone"),
            row.get("customer_email"),
            row.get("stripe_customer_id"),
            row.get("customer_name"),
            row.get("payment_intent_id"),
        )
        contributor_keys.add(contributor_key)

        try:
            total_amount_cents += int(row.get("amount_cents") or 0)
        except (TypeError, ValueError):
            continue

    return {
        "total_contributors": str(len(contributor_keys)),
        "total_contributions": str(len(row_list)),
        "total_contribution_amount": format_amount(total_amount_cents),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report all successful Stripe payments with livestream vs payment link source."
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only fetch the most recent N Stripe payment intents.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print JSON instead of an ASCII table.",
    )
    parser.add_argument(
        "--csv",
        dest="csv_path",
        help="Write CSV output to the given path, excluding PaymentIntent ID and totals.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    database_url = get_env("DATABASE_URL")
    stripe_secret_key = get_env("STRIPE_SECRET_KEY")

    if not database_url:
        print("Missing DATABASE_URL in environment, .env, or .env.example.", file=sys.stderr)
        return 1

    if not stripe_secret_key:
        print("Missing STRIPE_SECRET_KEY in environment, .env, or .env.example.", file=sys.stderr)
        return 1

    try:
        livestream_map = fetch_livestream_payment_map(database_url)
        payment_intents = fetch_all_payment_intents(stripe_secret_key, args.limit)
        report_rows = build_report_rows(payment_intents, livestream_map)
        summary = summarize_rows(report_rows)
    except Exception as error:
        print(str(error), file=sys.stderr)
        return 1

    if args.json:
        print(json.dumps({"summary": summary, "rows": report_rows}, indent=2))
        return 0

    if args.csv_path:
        write_csv(report_rows, args.csv_path)
        print(f"Wrote CSV to {args.csv_path}")
        return 0

    print(f"Total contributors: {summary['total_contributors']}")
    print(f"Total individual contributions: {summary['total_contributions']}")
    print(f"Total contribution amount: {summary['total_contribution_amount']}")

    if not report_rows:
        print("\nNo matching payments found.")
        return 0

    print()
    print(render_table(report_rows))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

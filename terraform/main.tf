terraform {
  required_providers {
    stripe = {
      source = "stripe/stripe"
      version = "0.1.3"
    }
  }
}

provider "stripe" {
  # API key is read from STRIPE_API_KEY environment variable
  # Alternatively, set it explicitly (not recommended for production)
  # api_key = "sk_test_..."
}

# Define a product
resource "stripe_product" "pro_plan" {
  name        = "Pro Plan"
  description = "Professional tier with advanced features"
}

# Create a recurring price for the product
resource "stripe_price" "pro_monthly" {
  product     = stripe_product.pro_plan.id
  currency    = "usd"
  unit_amount = 2900

  recurring {
    interval = "month"
  }
}

# Set up a webhook endpoint for payment events
resource "stripe_webhook_endpoint" "payments" {
  url = "https://api.example.com/webhooks/stripe"

  enabled_events = [
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "customer.subscription.created",
    "customer.subscription.deleted",
  ]
}

output "price_id" {
  value = stripe_price.pro_monthly.id
}

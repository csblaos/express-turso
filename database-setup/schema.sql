-- Generated schema-only baseline. Contains no application data.

-- Regenerate deliberately with: npm run db:schema:export

PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id integer primary key autoincrement,
      hash text not null,
      created_at numeric
    );

CREATE TABLE IF NOT EXISTS `audit_events` (
      `id` text primary key not null,
      `scope` text not null,
      `store_id` text references `stores`(`id`) on delete set null,
      `actor_user_id` text references `users`(`id`) on delete set null,
      `actor_name` text,
      `actor_role` text,
      `action` text not null,
      `entity_type` text not null,
      `entity_id` text,
      `result` text not null default 'SUCCESS',
      `reason_code` text,
      `ip_address` text,
      `user_agent` text,
      `request_id` text,
      `metadata` text,
      `before` text,
      `after` text,
      `occurred_at` text not null default (CURRENT_TIMESTAMP)
    );

CREATE TABLE IF NOT EXISTS `cash_flow_entries` (
      `id` text primary key not null,
      `store_id` text not null references `stores`(`id`) on delete cascade,
      `account_id` text references `financial_accounts`(`id`) on delete set null,
      `direction` text not null,
      `entry_type` text not null,
      `source_type` text not null,
      `source_id` text not null,
      `amount` integer not null,
      `currency` text not null default 'LAK',
      `reference` text,
      `note` text,
      `metadata` text not null default '{}',
      `occurred_at` text not null default (CURRENT_TIMESTAMP),
      `created_by` text references `users`(`id`) on delete set null,
      `created_at` text not null default (CURRENT_TIMESTAMP)
    );

CREATE TABLE IF NOT EXISTS `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`channel` text NOT NULL,
	`display_name` text NOT NULL,
	`phone` text,
	`last_inbound_at` text,
	`notes` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `fb_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`status` text DEFAULT 'DISCONNECTED' NOT NULL,
	`page_name` text,
	`page_id` text,
	`connected_at` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `financial_accounts` (
      `id` text primary key not null,
      `store_id` text not null references `stores`(`id`) on delete cascade,
      `display_name` text not null,
      `account_type` text not null,
      `store_payment_account_id` text references `store_payment_accounts`(`id`) on delete set null,
      `is_system` integer not null default 0,
      `is_active` integer not null default 1,
      `created_at` text not null default (CURRENT_TIMESTAMP),
      `updated_at` text not null default (CURRENT_TIMESTAMP)
    );

CREATE TABLE IF NOT EXISTS `idempotency_requests` (
      `id` text primary key not null,
      `store_id` text not null references `stores`(`id`) on delete cascade,
      `action` text not null,
      `idempotency_key` text not null,
      `request_hash` text not null,
      `status` text not null default 'PROCESSING',
      `response_status` integer,
      `response_body` text,
      `created_by` text references `users`(`id`) on delete set null,
      `created_at` text not null default (CURRENT_TIMESTAMP),
      `completed_at` text
    );

CREATE TABLE IF NOT EXISTS `inventory_balances` (
        `store_id` text not null references `stores`(`id`) on delete cascade,
        `product_id` text not null references `products`(`id`) on delete restrict,
        `on_hand_base` integer not null default 0,
        `reserved_base` integer not null default 0,
        `available_base` integer not null default 0,
        `updated_at` text not null default (CURRENT_TIMESTAMP),
        primary key (`store_id`, `product_id`)
      );

CREATE TABLE IF NOT EXISTS inventory_cost_layers (
				id TEXT PRIMARY KEY,
				store_id TEXT NOT NULL,
				product_id TEXT NOT NULL,
				source_type TEXT NOT NULL,
				source_id TEXT NOT NULL,
				source_line_id TEXT,
				cost_method TEXT NOT NULL DEFAULT 'average',
				qty_base_in REAL NOT NULL,
				qty_base_remaining REAL NOT NULL,
				unit_cost_base REAL NOT NULL,
				total_cost_base REAL NOT NULL,
				note TEXT,
				meta_json TEXT,
				created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);

CREATE TABLE IF NOT EXISTS inventory_cost_summaries (
				store_id TEXT NOT NULL,
				product_id TEXT NOT NULL,
				qty_base_on_hand REAL NOT NULL DEFAULT 0,
				total_cost_base REAL NOT NULL DEFAULT 0,
				average_unit_cost_base REAL NOT NULL DEFAULT 0,
				last_receipt_at TEXT,
				updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				PRIMARY KEY (store_id, product_id)
			);

CREATE TABLE IF NOT EXISTS `inventory_movements` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product_id` text NOT NULL,
	`type` text NOT NULL,
	`qty_base` integer NOT NULL,
	`ref_type` text NOT NULL,
	`ref_id` text,
	`note` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS `notification_inbox` (
      `id` text primary key not null,
      `store_id` text not null references `stores`(`id`) on delete cascade,
      `topic` text not null default 'PURCHASE_AP_DUE',
      `entity_type` text not null,
      `entity_id` text not null,
      `dedupe_key` text not null,
      `title` text not null,
      `message` text not null,
      `severity` text not null default 'WARNING',
      `status` text not null default 'UNREAD',
      `due_status` text,
      `due_date` text,
      `payload` text not null default '{}',
      `first_detected_at` text not null default (CURRENT_TIMESTAMP),
      `last_detected_at` text not null default (CURRENT_TIMESTAMP),
      `read_at` text,
      `resolved_at` text,
      `created_at` text not null default (CURRENT_TIMESTAMP),
      `updated_at` text not null default (CURRENT_TIMESTAMP)
    );

CREATE TABLE IF NOT EXISTS notification_reads (
					notification_id TEXT NOT NULL,
					user_id TEXT NOT NULL,
					read_at TEXT NOT NULL,
					PRIMARY KEY (notification_id, user_id)
				);

CREATE TABLE IF NOT EXISTS `notification_rules` (
      `id` text primary key not null,
      `store_id` text not null references `stores`(`id`) on delete cascade,
      `topic` text not null default 'PURCHASE_AP_DUE',
      `entity_type` text not null,
      `entity_id` text not null,
      `muted_forever` integer not null default 0,
      `muted_until` text,
      `snoozed_until` text,
      `note` text,
      `updated_by` text references `users`(`id`) on delete set null,
      `created_at` text not null default (CURRENT_TIMESTAMP),
      `updated_at` text not null default (CURRENT_TIMESTAMP)
    );

CREATE TABLE IF NOT EXISTS notification_scan_state (
					store_id TEXT PRIMARY KEY,
					scanned_at TEXT NOT NULL
				);

CREATE TABLE IF NOT EXISTS `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`qty` integer NOT NULL,
	`qty_base` integer NOT NULL,
	`price_base_at_sale` integer NOT NULL,
	`cost_base_at_sale` integer NOT NULL,
	`line_total` integer NOT NULL, is_gift INTEGER NOT NULL DEFAULT 0, promotion_id TEXT, round_id TEXT, line_status TEXT NOT NULL DEFAULT 'sent', note TEXT, sent_at TEXT, cancelled_at TEXT, cancelled_by TEXT, cancel_reason TEXT, inventory_applied_at TEXT, cost_source_at_sale TEXT NOT NULL DEFAULT 'purchase',
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE restrict
);

CREATE TABLE IF NOT EXISTS order_promotions (
				id TEXT PRIMARY KEY, order_id TEXT NOT NULL, promotion_id TEXT NOT NULL, promotion_name TEXT NOT NULL,
				promotion_type TEXT NOT NULL, applications INTEGER NOT NULL, gift_product_id TEXT NOT NULL, gift_qty INTEGER NOT NULL, created_at TEXT NOT NULL
			, discount_method TEXT, discount_value REAL, discount_amount REAL NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS `order_shipments` (
      `id` text primary key not null,
      `order_id` text not null references `orders`(`id`) on delete cascade,
      `store_id` text not null references `stores`(`id`) on delete cascade,
      `provider` text not null,
      `status` text not null default 'REQUESTED',
      `tracking_no` text,
      `label_url` text,
      `label_file_key` text,
      `provider_request_id` text,
      `provider_response` text,
      `last_error` text,
      `created_by` text references `users`(`id`) on delete set null,
      `created_at` text not null default (CURRENT_TIMESTAMP),
      `updated_at` text not null default (CURRENT_TIMESTAMP)
    );

CREATE TABLE IF NOT EXISTS `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_no` text NOT NULL,
	`channel` text DEFAULT 'WALK_IN' NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`contact_id` text,
	`customer_name` text,
	`customer_phone` text,
	`customer_address` text,
	`subtotal` integer DEFAULT 0 NOT NULL,
	`discount` integer DEFAULT 0 NOT NULL,
	`vat_amount` integer DEFAULT 0 NOT NULL,
	`shipping_fee_charged` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`shipping_cost` integer DEFAULT 0 NOT NULL,
	`paid_at` text,
	`shipped_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL, `shipping_carrier` text, `tracking_no` text, `payment_currency` text not null default 'LAK', `payment_method` text not null default 'CASH', `payment_account_id` text, `payment_slip_url` text, `payment_proof_submitted_at` text, `payment_status` text not null default 'UNPAID', `shipping_provider` text, `shipping_label_status` text not null default 'NONE', `shipping_label_url` text, `shipping_label_file_key` text, `shipping_request_id` text, `cod_amount` integer not null default 0, `cod_fee` integer not null default 0, `cod_settled_at` text, `cod_returned_at` text, `cod_return_note` text, service_mode TEXT NOT NULL DEFAULT 'walk-in', amount_tendered REAL NOT NULL DEFAULT 0, change_amount REAL NOT NULL DEFAULT 0, payment_reference TEXT, note TEXT, restaurant_table_id TEXT, guest_count INTEGER NOT NULL DEFAULT 1, opened_at TEXT, closed_at TEXT, version INTEGER NOT NULL DEFAULT 1, checkout_idempotency_key TEXT, open_idempotency_key TEXT, queue_no TEXT, queue_date TEXT, guest_count_specified INTEGER NOT NULL DEFAULT 0, fulfillment_status TEXT, collected_at TEXT, collected_by TEXT,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS `permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`resource` text NOT NULL,
	`action` text NOT NULL
);

CREATE TABLE IF NOT EXISTS `product_categories` (
      `id` text primary key not null,
      `store_id` text not null references `stores`(`id`) on delete cascade,
      `name` text not null,
      `sort_order` integer not null default 0,
      `created_at` text not null default (CURRENT_TIMESTAMP)
    );

CREATE TABLE IF NOT EXISTS `product_model_attribute_values` (
      `id` text primary key not null,
      `attribute_id` text not null references `product_model_attributes`(`id`) on delete cascade,
      `code` text not null,
      `name` text not null,
      `sort_order` integer not null default 0,
      `created_at` text not null default (CURRENT_TIMESTAMP)
    );

CREATE TABLE IF NOT EXISTS `product_model_attributes` (
      `id` text primary key not null,
      `model_id` text not null references `product_models`(`id`) on delete cascade,
      `code` text not null,
      `name` text not null,
      `sort_order` integer not null default 0,
      `created_at` text not null default (CURRENT_TIMESTAMP)
    );

CREATE TABLE IF NOT EXISTS `product_models` (
      `id` text primary key not null,
      `store_id` text not null references `stores`(`id`) on delete cascade,
      `name` text not null,
      `category_id` text references `product_categories`(`id`) on delete set null,
      `image_url` text,
      `description` text,
      `active` integer not null default 1,
      `created_at` text not null default (CURRENT_TIMESTAMP)
    );

CREATE TABLE IF NOT EXISTS `product_units` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`multiplier_to_base` integer NOT NULL, `price_per_unit` integer, `enabled_for_sale` integer not null default 1,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE restrict
);

CREATE TABLE IF NOT EXISTS `products` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`sku` text NOT NULL,
	`name` text NOT NULL,
	`barcode` text,
	`base_unit_id` text NOT NULL,
	`price_base` integer NOT NULL,
	`cost_base` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL, `image_url` text, `category_id` text references `product_categories`(`id`) on delete set null, `out_stock_threshold` integer, `low_stock_threshold` integer, `model_id` text references `product_models`(`id`) on delete set null, `variant_label` text, `variant_options_json` text, `variant_sort_order` integer not null default 0, `allow_base_unit_sale` integer not null default 1, deleted_at TEXT, location TEXT, updated_at TEXT, inventory_mode TEXT NOT NULL DEFAULT 'tracked', cost_source TEXT NOT NULL DEFAULT 'purchase', manual_sold_out INTEGER NOT NULL DEFAULT 0,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`base_unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);

CREATE TABLE IF NOT EXISTS promotions (
				id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
				qualifying_product_id TEXT, qualifying_qty INTEGER, minimum_subtotal REAL,
				gift_product_id TEXT NOT NULL, gift_qty INTEGER NOT NULL, starts_at TEXT, ends_at TEXT,
				is_active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
			, apply_mode TEXT NOT NULL DEFAULT 'manual', discount_method TEXT, discount_value REAL, max_applications_per_bill INTEGER, max_discount_amount_per_bill REAL);

CREATE TABLE IF NOT EXISTS `purchase_order_items` (
      `id` text primary key not null,
      `purchase_order_id` text not null references `purchase_orders`(`id`) on delete cascade,
      `product_id` text not null references `products`(`id`) on delete restrict,
      `qty_ordered` integer not null,
      `qty_received` integer not null default 0,
      `unit_cost_purchase` integer not null default 0,
      `unit_cost_base` integer not null default 0,
      `landed_cost_per_unit` integer not null default 0
    , `unit_id` text references `units`(`id`) on delete restrict, `multiplier_to_base` integer not null default 1, `qty_base_ordered` integer not null default 0, `qty_base_received` integer not null default 0);

CREATE TABLE IF NOT EXISTS `purchase_order_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`purchase_order_id` text NOT NULL,
	`store_id` text NOT NULL,
	`entry_type` text DEFAULT 'PAYMENT' NOT NULL,
	`amount_base` integer NOT NULL,
	`paid_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`reference` text,
	`note` text,
	`reversed_payment_id` text,
	`created_by` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL, estimated_amount_base REAL NOT NULL DEFAULT 0, variance_base REAL NOT NULL DEFAULT 0,
	FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reversed_payment_id`) REFERENCES `purchase_order_payments`(`id`) ON UPDATE no action ON DELETE set null
);

CREATE TABLE IF NOT EXISTS `purchase_orders` (
      `id` text primary key not null,
      `store_id` text not null references `stores`(`id`) on delete cascade,
      `po_number` text not null,
      `supplier_name` text,
      `supplier_contact` text,
      `purchase_currency` text not null default 'LAK',
      `exchange_rate` integer not null default 1,
      `shipping_cost` integer not null default 0,
      `other_cost` integer not null default 0,
      `other_cost_note` text,
      `status` text not null default 'DRAFT',
      `ordered_at` text,
      `expected_at` text,
      `shipped_at` text,
      `received_at` text,
      `tracking_info` text,
      `note` text,
      `created_by` text references `users`(`id`),
      `created_at` text not null default (CURRENT_TIMESTAMP)
    , `cancelled_at` text, `updated_by` text, `updated_at` text, `exchange_rate_locked_at` text, `exchange_rate_locked_by` text REFERENCES users(id), `exchange_rate_lock_note` text, `exchange_rate_initial` integer DEFAULT 1 NOT NULL, `payment_status` text DEFAULT 'UNPAID' NOT NULL, `paid_at` text, `paid_by` text REFERENCES users(id), `payment_reference` text, `payment_note` text, `due_date` text, `shipping_cost_original` integer not null default 0, `shipping_cost_currency` text not null default 'LAK', `other_cost_original` integer not null default 0, `other_cost_currency` text not null default 'LAK');

CREATE TABLE IF NOT EXISTS restaurant_daily_sequences (
			store_id TEXT NOT NULL, sequence_date TEXT NOT NULL, last_queue_no INTEGER NOT NULL DEFAULT 0,
			PRIMARY KEY(store_id, sequence_date)
		);

CREATE TABLE IF NOT EXISTS restaurant_order_rounds (
			id TEXT PRIMARY KEY, order_id TEXT NOT NULL, round_no INTEGER NOT NULL, sent_by TEXT NOT NULL,
			sent_at TEXT NOT NULL, idempotency_key TEXT NOT NULL, dispatch_mode TEXT NOT NULL DEFAULT 'kitchen', UNIQUE(order_id, round_no), UNIQUE(order_id, idempotency_key)
		);

CREATE TABLE IF NOT EXISTS restaurant_tables (
			id TEXT PRIMARY KEY, store_id TEXT NOT NULL, zone_id TEXT NOT NULL, name TEXT NOT NULL, code TEXT,
			capacity INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1,
			created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(store_id, zone_id, name)
		);

CREATE TABLE IF NOT EXISTS restaurant_zones (
			id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
			is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
			UNIQUE(store_id, name)
		);

CREATE TABLE IF NOT EXISTS `role_permissions` (
	`role_id` text NOT NULL,
	`permission_id` text NOT NULL,
	PRIMARY KEY(`role_id`, `permission_id`),
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS `roles` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL, deleted_at TEXT,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS schema_migrations (
				id TEXT PRIMARY KEY,
				description TEXT NOT NULL,
				applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
			);

CREATE TABLE IF NOT EXISTS `shipping_providers` (
      `id` text primary key not null,
      `store_id` text not null,
      `code` text not null,
      `display_name` text not null,
      `branch_name` text,
      `aliases` text not null default '[]',
      `active` integer not null default 1,
      `sort_order` integer not null default 0,
      `created_at` text not null default (CURRENT_TIMESTAMP),
      foreign key (`store_id`) references `stores`(`id`) on delete cascade
    );

CREATE TABLE IF NOT EXISTS `store_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`code` text,
	`address` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL, `source_branch_id` text REFERENCES store_branches(id) ON DELETE set null, `sharing_mode` text, `sharing_config` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS store_cost_method_history (
				id TEXT PRIMARY KEY,
				store_id TEXT NOT NULL,
				cost_method TEXT NOT NULL,
				actor_user_id TEXT,
				occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);

CREATE TABLE IF NOT EXISTS store_currency_rate_history (
				id TEXT PRIMARY KEY,
				store_id TEXT NOT NULL,
				base_currency TEXT NOT NULL,
				currency TEXT NOT NULL,
				rate_to_base REAL NOT NULL,
				actor_user_id TEXT,
				occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			);

CREATE TABLE IF NOT EXISTS store_currency_rates (
				store_id TEXT NOT NULL,
				currency TEXT NOT NULL,
				rate_to_base REAL NOT NULL DEFAULT 1,
				updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				PRIMARY KEY (store_id, currency)
			);

CREATE TABLE IF NOT EXISTS store_integrations (
				id TEXT PRIMARY KEY,
				store_id TEXT NOT NULL,
				provider_type TEXT NOT NULL,
				provider_name TEXT NOT NULL,
				username_encrypted TEXT,
				password_encrypted TEXT,
				access_token_encrypted TEXT,
				refresh_token_encrypted TEXT,
				token_expires_at TEXT,
				metadata_json TEXT,
				created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
				UNIQUE(store_id, provider_name)
			);

CREATE TABLE IF NOT EXISTS `store_member_branches` (
  `store_id` text NOT NULL,
  `user_id` text NOT NULL,
  `branch_id` text NOT NULL,
  `created_at` text NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`branch_id`) REFERENCES `store_branches`(`id`) ON UPDATE no action ON DELETE cascade,
  PRIMARY KEY(`store_id`, `user_id`, `branch_id`)
);

CREATE TABLE IF NOT EXISTS `store_members` (
	`store_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role_id` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL, `added_by` text,
	PRIMARY KEY(`store_id`, `user_id`),
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE restrict
);

CREATE TABLE IF NOT EXISTS "store_payment_accounts" (
					id TEXT PRIMARY KEY,
					store_id TEXT NOT NULL,
					display_name TEXT NOT NULL,
					account_type TEXT,
					bank_name TEXT,
					account_name TEXT NOT NULL,
					account_number TEXT,
					promptpay_id TEXT,
					is_default INTEGER NOT NULL DEFAULT 0,
					is_active INTEGER NOT NULL DEFAULT 1,
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					qr_image_url TEXT,
					currency TEXT NOT NULL DEFAULT 'LAK'
				);

CREATE TABLE IF NOT EXISTS store_role_preset_migrations (
					store_id TEXT NOT NULL,
					version INTEGER NOT NULL,
					applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
					PRIMARY KEY (store_id, version)
				);

CREATE TABLE IF NOT EXISTS `store_type_templates` (
      `store_type` text primary key not null,
      `app_layout` text not null,
      `display_name` text not null,
      `description` text not null,
      `created_at` text not null default (CURRENT_TIMESTAMP),
      `updated_at` text not null default (CURRENT_TIMESTAMP)
    );

CREATE TABLE IF NOT EXISTS `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`store_type` text DEFAULT 'ONLINE_RETAIL' NOT NULL,
	`currency` text DEFAULT 'LAK' NOT NULL,
	`vat_enabled` integer DEFAULT false NOT NULL,
	`vat_rate` integer DEFAULT 700 NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
, `max_branches_override` integer, `logo_name` text, `logo_url` text, `address` text, `phone_number` text, `supported_currencies` text not null default '["LAK"]', `vat_mode` text not null default 'EXCLUSIVE', `out_stock_threshold` integer not null default 0, `low_stock_threshold` integer not null default 10, `pdf_show_logo` integer not null default 1, `pdf_show_signature` integer not null default 1, `pdf_show_note` integer not null default 1, `pdf_header_color` text not null default '#f1f5f9', `pdf_company_name` text, `pdf_company_address` text, `pdf_company_phone` text, owner_user_id TEXT, allow_negative_stock INTEGER NOT NULL DEFAULT 0, cost_method TEXT NOT NULL DEFAULT 'average', receipt_show_store_address INTEGER NOT NULL DEFAULT 1, receipt_show_store_phone INTEGER NOT NULL DEFAULT 1, receipt_show_tendered INTEGER NOT NULL DEFAULT 1, receipt_show_change INTEGER NOT NULL DEFAULT 1, receipt_show_queue INTEGER NOT NULL DEFAULT 1, pickup_queue_enabled INTEGER NOT NULL DEFAULT 0, receipt_show_payment_method INTEGER NOT NULL DEFAULT 1, business_day_start_minutes INTEGER NOT NULL DEFAULT 0, receipt_show_store_name INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS `system_config` (
	`id` text PRIMARY KEY DEFAULT 'global' NOT NULL,
	`default_can_create_branches` integer DEFAULT true NOT NULL,
	"default_max_branches_per_store" integer DEFAULT 1,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
, `default_session_limit` integer DEFAULT 1 NOT NULL, `store_logo_max_size_mb` integer not null default 5, "store_logo_auto_resize" integer NOT NULL DEFAULT true, `store_logo_resize_max_width` integer not null default 1280, `payment_max_accounts_per_store` integer not null default 5, `payment_require_slip_for_lao_qr` integer not null default 1, `app_latest_build` integer not null default 0, `app_min_required_build` integer not null default 0, `app_update_message` text, auth_access_token_ttl_minutes INTEGER NOT NULL DEFAULT 15, auth_refresh_token_ttl_days INTEGER NOT NULL DEFAULT 7, auth_remember_me_refresh_ttl_days INTEGER NOT NULL DEFAULT 30, auth_max_failed_attempts INTEGER NOT NULL DEFAULT 5, auth_lockout_minutes INTEGER NOT NULL DEFAULT 15, auth_allow_multi_session INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS `units` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name_th` text NOT NULL
, `scope` text DEFAULT 'SYSTEM' NOT NULL, `store_id` text);

CREATE TABLE IF NOT EXISTS `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
, `session_limit` integer, `system_role` text not null default 'USER', `can_create_stores` integer, `max_stores` integer, `can_create_branches` integer, `max_branches_per_store` integer, `created_by` text, `must_change_password` integer not null default 0, `password_updated_at` text, `ui_locale` text not null default 'th', `client_suspended` integer not null default 0, `client_suspended_at` text, `client_suspended_reason` text, `client_suspended_by` text);

CREATE TABLE IF NOT EXISTS `wa_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`status` text DEFAULT 'DISCONNECTED' NOT NULL,
	`phone_number` text,
	`connected_at` text,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS `audit_events_action_occurred_at_idx` on `audit_events` (`action`, `occurred_at`);

CREATE INDEX IF NOT EXISTS `audit_events_actor_occurred_at_idx` on `audit_events` (`actor_user_id`, `occurred_at`);

CREATE INDEX IF NOT EXISTS `audit_events_entity_occurred_at_idx` on `audit_events` (`entity_type`, `entity_id`, `occurred_at`);

CREATE INDEX IF NOT EXISTS `audit_events_scope_occurred_at_idx` on `audit_events` (`scope`, `occurred_at`);

CREATE INDEX IF NOT EXISTS `audit_events_store_occurred_at_idx` on `audit_events` (`store_id`, `occurred_at`);

CREATE INDEX IF NOT EXISTS `cash_flow_entries_account_occurred_at_idx` on `cash_flow_entries` (`account_id`, `occurred_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `cash_flow_entries_source_unique` on `cash_flow_entries` (`store_id`, `source_type`, `source_id`, `entry_type`);

CREATE INDEX IF NOT EXISTS `cash_flow_entries_store_direction_occurred_at_idx` on `cash_flow_entries` (`store_id`, `direction`, `occurred_at`);

CREATE INDEX IF NOT EXISTS `cash_flow_entries_store_occurred_at_idx` on `cash_flow_entries` (`store_id`, `occurred_at`);

CREATE INDEX IF NOT EXISTS `cash_flow_entries_store_type_occurred_at_idx` on `cash_flow_entries` (`store_id`, `entry_type`, `occurred_at`);

CREATE INDEX IF NOT EXISTS `contacts_created_at_idx` ON `contacts` (`created_at`);

CREATE INDEX IF NOT EXISTS `contacts_store_id_idx` ON `contacts` (`store_id`);

CREATE INDEX IF NOT EXISTS `fb_connections_store_id_idx` ON `fb_connections` (`store_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `financial_accounts_payment_account_unique` on `financial_accounts` (`store_payment_account_id`) where `store_payment_account_id` is not null;

CREATE INDEX IF NOT EXISTS `financial_accounts_store_active_idx` on `financial_accounts` (`store_id`, `is_active`);

CREATE INDEX IF NOT EXISTS `financial_accounts_store_id_idx` on `financial_accounts` (`store_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `financial_accounts_store_system_type_unique` on `financial_accounts` (`store_id`, `account_type`) where `is_system` = 1;

CREATE INDEX IF NOT EXISTS `financial_accounts_store_type_idx` on `financial_accounts` (`store_id`, `account_type`);

CREATE INDEX IF NOT EXISTS `idempotency_requests_status_created_at_idx` on `idempotency_requests` (`status`, `created_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `idempotency_requests_store_action_key_unique` on `idempotency_requests` (`store_id`, `action`, `idempotency_key`);

CREATE INDEX IF NOT EXISTS `idempotency_requests_store_created_at_idx` on `idempotency_requests` (`store_id`, `created_at`);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity_type ON audit_events (entity_type);

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON audit_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_result ON audit_events (result);

CREATE INDEX IF NOT EXISTS idx_audit_events_scope ON audit_events (scope);

CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_store_action_key ON idempotency_requests (store_id, action, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_store_product_created ON inventory_cost_layers (store_id, product_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_store_product_remaining ON inventory_cost_layers (store_id, product_id, qty_base_remaining);

CREATE INDEX IF NOT EXISTS idx_inventory_cost_summaries_store_product ON inventory_cost_summaries (store_id, product_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_inbox_dedupe ON notification_inbox (dedupe_key);

CREATE INDEX IF NOT EXISTS idx_notification_inbox_store_status_updated ON notification_inbox (store_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_inbox_store_topic_entity ON notification_inbox (store_id, topic, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads (user_id, read_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_promotions_order ON order_promotions (order_id);

CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders (store_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_store_order_no ON orders (store_id, order_no);

CREATE INDEX IF NOT EXISTS idx_product_units_product_enabled ON product_units (product_id, enabled_for_sale, unit_id);

CREATE INDEX IF NOT EXISTS idx_products_store_barcode ON products (store_id, barcode);

CREATE INDEX IF NOT EXISTS idx_products_store_deleted_active ON products (store_id, deleted_at, active);

CREATE INDEX IF NOT EXISTS idx_products_store_deleted_category ON products (store_id, deleted_at, category_id);

CREATE INDEX IF NOT EXISTS idx_products_store_deleted_created ON products (store_id, deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_store_sku ON products (store_id, sku);

CREATE INDEX IF NOT EXISTS idx_promotions_store_active ON promotions (store_id, is_active, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items (purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_payments_po ON purchase_order_payments (purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders (status);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_store_created ON purchase_orders (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_items_order_product ON order_items(order_id, product_id, line_status, is_gift);

CREATE INDEX IF NOT EXISTS idx_reports_orders_store_closed ON orders(store_id, status, closed_at);

CREATE INDEX IF NOT EXISTS idx_reports_orders_store_paid_channel ON orders(store_id,paid_at,service_mode,channel);

CREATE INDEX IF NOT EXISTS idx_reports_orders_store_state_paid ON orders(store_id, status, payment_status, paid_at);

CREATE INDEX IF NOT EXISTS idx_restaurant_items_order_status ON order_items(order_id, line_status);

CREATE INDEX IF NOT EXISTS idx_restaurant_open_pickup ON orders(store_id, service_mode, status, opened_at);

CREATE INDEX IF NOT EXISTS idx_restaurant_orders_table ON orders(store_id, restaurant_table_id, status);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_store_zone ON restaurant_tables(store_id, zone_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_restaurant_zones_store ON restaurant_zones(store_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_roles_store_deleted ON roles(store_id, deleted_at, is_system, name, created_at);

CREATE INDEX IF NOT EXISTS idx_store_cost_method_history_store ON store_cost_method_history (store_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_currency_rate_history_currency ON store_currency_rate_history (store_id, currency, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_currency_rate_history_store ON store_currency_rate_history (store_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_currency_rates_store ON store_currency_rates (store_id, currency);

CREATE INDEX IF NOT EXISTS idx_store_members_user_status_store ON store_members(user_id, status, store_id);

CREATE INDEX IF NOT EXISTS idx_store_payment_accounts_store ON store_payment_accounts (store_id, is_default DESC, is_active DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_storefront_pickup_queue ON orders(store_id, fulfillment_status, paid_at);

CREATE INDEX IF NOT EXISTS idx_stores_owner_created ON stores (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS `inventory_balances_product_id_idx` on `inventory_balances` (`product_id`);

CREATE INDEX IF NOT EXISTS `inventory_balances_store_available_idx` on `inventory_balances` (`store_id`, `available_base`, `product_id`);

CREATE INDEX IF NOT EXISTS `inventory_balances_store_on_hand_idx` on `inventory_balances` (`store_id`, `on_hand_base`, `product_id`);

CREATE INDEX IF NOT EXISTS `inventory_movements_created_at_idx` ON `inventory_movements` (`created_at`);

CREATE INDEX IF NOT EXISTS `inventory_movements_product_id_idx` ON `inventory_movements` (`product_id`);

CREATE INDEX IF NOT EXISTS `inventory_movements_store_id_idx` ON `inventory_movements` (`store_id`);

CREATE INDEX IF NOT EXISTS `inventory_movements_store_product_idx` on `inventory_movements` (`store_id`, `product_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `notification_inbox_store_dedupe_unique` on `notification_inbox` (`store_id`, `dedupe_key`);

CREATE INDEX IF NOT EXISTS `notification_inbox_store_entity_idx` on `notification_inbox` (`store_id`, `entity_type`, `entity_id`);

CREATE INDEX IF NOT EXISTS `notification_inbox_store_status_detected_idx` on `notification_inbox` (`store_id`, `status`, `last_detected_at`);

CREATE INDEX IF NOT EXISTS `notification_inbox_store_topic_detected_idx` on `notification_inbox` (`store_id`, `topic`, `last_detected_at`);

CREATE INDEX IF NOT EXISTS `notification_rules_store_entity_idx` on `notification_rules` (`store_id`, `entity_type`, `entity_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `notification_rules_store_topic_entity_unique` on `notification_rules` (`store_id`, `topic`, `entity_type`, `entity_id`);

CREATE INDEX IF NOT EXISTS `notification_rules_store_topic_idx` on `notification_rules` (`store_id`, `topic`);

CREATE INDEX IF NOT EXISTS `order_items_order_id_idx` ON `order_items` (`order_id`);

CREATE INDEX IF NOT EXISTS `order_items_product_id_idx` ON `order_items` (`product_id`);

CREATE INDEX IF NOT EXISTS `order_shipments_order_id_idx` on `order_shipments` (`order_id`);

CREATE INDEX IF NOT EXISTS `order_shipments_provider_request_id_idx` on `order_shipments` (`provider_request_id`);

CREATE INDEX IF NOT EXISTS `order_shipments_store_status_created_at_idx` on `order_shipments` (`store_id`, `status`, `created_at`);

CREATE INDEX IF NOT EXISTS `orders_created_at_idx` ON `orders` (`created_at`);

CREATE INDEX IF NOT EXISTS `orders_order_no_idx` ON `orders` (`order_no`);

CREATE INDEX IF NOT EXISTS `orders_store_created_at_idx` ON `orders` (`store_id`,`created_at`);

CREATE INDEX IF NOT EXISTS `orders_store_id_idx` ON `orders` (`store_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `orders_store_order_no_unique` ON `orders` (`store_id`,`order_no`);

CREATE INDEX IF NOT EXISTS `orders_store_payment_method_idx` on `orders` (`store_id`,`payment_method`);

CREATE INDEX IF NOT EXISTS `orders_store_payment_status_created_at_idx` on `orders` (`store_id`,`payment_status`,`created_at`);

CREATE INDEX IF NOT EXISTS `orders_store_shipping_label_status_updated_idx` on `orders` (`store_id`,`shipping_label_status`,`created_at`);

CREATE INDEX IF NOT EXISTS `orders_store_status_channel_idx` ON `orders` (`store_id`,`status`,`channel`);

CREATE INDEX IF NOT EXISTS `orders_store_status_created_at_idx` ON `orders` (`store_id`,`status`,`created_at`);

CREATE INDEX IF NOT EXISTS `orders_store_status_paid_at_idx` ON `orders` (`store_id`,`status`,`paid_at`);

CREATE UNIQUE INDEX IF NOT EXISTS `permissions_key_unique` ON `permissions` (`key`);

CREATE UNIQUE INDEX IF NOT EXISTS `permissions_resource_action_unique` ON `permissions` (`resource`,`action`);

CREATE INDEX IF NOT EXISTS `po_created_at_idx` on `purchase_orders` (`store_id`, `created_at`);

CREATE INDEX IF NOT EXISTS `po_due_date_idx` ON `purchase_orders` (`store_id`,`due_date`);

CREATE INDEX IF NOT EXISTS `po_exchange_rate_locked_at_idx` ON `purchase_orders` (`store_id`,`exchange_rate_locked_at`);

CREATE INDEX IF NOT EXISTS `po_items_po_id_idx` on `purchase_order_items` (`purchase_order_id`);

CREATE INDEX IF NOT EXISTS `po_items_product_id_idx` on `purchase_order_items` (`product_id`);

CREATE INDEX IF NOT EXISTS `po_payment_status_paid_at_idx` ON `purchase_orders` (`store_id`,`payment_status`,`paid_at`);

CREATE INDEX IF NOT EXISTS `po_payments_po_id_idx` ON `purchase_order_payments` (`purchase_order_id`);

CREATE INDEX IF NOT EXISTS `po_payments_reversed_id_idx` ON `purchase_order_payments` (`reversed_payment_id`);

CREATE INDEX IF NOT EXISTS `po_payments_store_paid_at_idx` ON `purchase_order_payments` (`store_id`,`paid_at`);

CREATE INDEX IF NOT EXISTS `po_status_idx` on `purchase_orders` (`store_id`, `status`);

CREATE INDEX IF NOT EXISTS `po_store_id_idx` on `purchase_orders` (`store_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `po_store_po_number_unique` on `purchase_orders` (`store_id`, `po_number`);

CREATE INDEX IF NOT EXISTS `po_supplier_received_at_idx` ON `purchase_orders` (`store_id`,`supplier_name`,`received_at`);

CREATE INDEX IF NOT EXISTS `po_updated_at_idx` on `purchase_orders` (`store_id`, `updated_at`);

CREATE INDEX IF NOT EXISTS `product_categories_store_id_idx` on `product_categories` (`store_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `product_categories_store_name_unique` on `product_categories` (`store_id`, `name`);

CREATE UNIQUE INDEX IF NOT EXISTS `product_model_attribute_values_attribute_code_unique` on `product_model_attribute_values` (`attribute_id`, `code`);

CREATE INDEX IF NOT EXISTS `product_model_attribute_values_attribute_id_idx` on `product_model_attribute_values` (`attribute_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `product_model_attributes_model_code_unique` on `product_model_attributes` (`model_id`, `code`);

CREATE INDEX IF NOT EXISTS `product_model_attributes_model_id_idx` on `product_model_attributes` (`model_id`);

CREATE INDEX IF NOT EXISTS `product_models_category_id_idx` on `product_models` (`category_id`);

CREATE INDEX IF NOT EXISTS `product_models_created_at_idx` on `product_models` (`created_at`);

CREATE INDEX IF NOT EXISTS `product_models_store_id_idx` on `product_models` (`store_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `product_models_store_name_unique` on `product_models` (`store_id`, `name`);

CREATE INDEX IF NOT EXISTS `product_units_product_id_idx` ON `product_units` (`product_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `product_units_unique` ON `product_units` (`product_id`,`unit_id`);

CREATE INDEX IF NOT EXISTS `products_category_id_idx` on `products` (`category_id`);

CREATE INDEX IF NOT EXISTS `products_created_at_idx` ON `products` (`created_at`);

CREATE INDEX IF NOT EXISTS `products_model_id_idx` on `products` (`model_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `products_model_variant_options_unique` on `products` (`model_id`, `variant_options_json`) where `model_id` is not null and `variant_options_json` is not null;

CREATE INDEX IF NOT EXISTS `products_store_barcode_idx` on `products` (`store_id`, `barcode`);

CREATE INDEX IF NOT EXISTS `products_store_category_name_idx` on `products` (`store_id`, `category_id`, `name`);

CREATE INDEX IF NOT EXISTS `products_store_id_idx` ON `products` (`store_id`);

CREATE INDEX IF NOT EXISTS `products_store_name_idx` on `products` (`store_id`, `name`);

CREATE UNIQUE INDEX IF NOT EXISTS `products_store_sku_unique` ON `products` (`store_id`,`sku`);

CREATE INDEX IF NOT EXISTS `role_permissions_role_id_idx` ON `role_permissions` (`role_id`);

CREATE INDEX IF NOT EXISTS `roles_created_at_idx` ON `roles` (`created_at`);

CREATE INDEX IF NOT EXISTS `roles_store_id_idx` ON `roles` (`store_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `roles_store_name_unique` ON `roles` (`store_id`,`name`);

CREATE INDEX IF NOT EXISTS `shipping_providers_store_active_sort_idx` on `shipping_providers` (`store_id`,`active`,`sort_order`,`display_name`);

CREATE UNIQUE INDEX IF NOT EXISTS `shipping_providers_store_code_unique` on `shipping_providers` (`store_id`,`code`);

CREATE INDEX IF NOT EXISTS `shipping_providers_store_id_idx` on `shipping_providers` (`store_id`);

CREATE INDEX IF NOT EXISTS `store_branches_source_branch_id_idx` ON `store_branches` (`source_branch_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `store_branches_store_code_unique` ON `store_branches` (`store_id`,`code`);

CREATE INDEX IF NOT EXISTS `store_branches_store_created_at_idx` ON `store_branches` (`store_id`,`created_at`);

CREATE INDEX IF NOT EXISTS `store_branches_store_id_idx` ON `store_branches` (`store_id`);

CREATE UNIQUE INDEX IF NOT EXISTS `store_branches_store_name_unique` ON `store_branches` (`store_id`,`name`);

CREATE INDEX IF NOT EXISTS `store_member_branches_branch_idx` ON `store_member_branches` (`branch_id`);

CREATE INDEX IF NOT EXISTS `store_member_branches_store_user_idx` ON `store_member_branches` (`store_id`, `user_id`);

CREATE INDEX IF NOT EXISTS `store_members_added_by_idx` on `store_members` (`added_by`);

CREATE INDEX IF NOT EXISTS `store_members_created_at_idx` ON `store_members` (`created_at`);

CREATE INDEX IF NOT EXISTS `store_members_role_id_idx` ON `store_members` (`role_id`);

CREATE INDEX IF NOT EXISTS `store_members_store_id_idx` ON `store_members` (`store_id`);

CREATE INDEX IF NOT EXISTS `store_type_templates_app_layout_idx` ON `store_type_templates` (`app_layout`);

CREATE INDEX IF NOT EXISTS `stores_created_at_idx` ON `stores` (`created_at`);

CREATE UNIQUE INDEX IF NOT EXISTS units_store_code_unique ON units(store_id, code) WHERE LOWER(scope)='store';

CREATE INDEX IF NOT EXISTS units_store_id_idx ON units(store_id);

CREATE UNIQUE INDEX IF NOT EXISTS units_system_code_unique ON units(code) WHERE LOWER(scope)='system';

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_checkout_idempotency
			ON orders(store_id, checkout_idempotency_key)
			WHERE checkout_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_open_idempotency
			ON orders(store_id, open_idempotency_key)
			WHERE open_idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_open_order_per_table
			ON orders(store_id, restaurant_table_id)
			WHERE restaurant_table_id IS NOT NULL AND status IN ('open','ready_to_pay');

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_queue_per_day
			ON orders(store_id, queue_date, queue_no)
			WHERE queue_date IS NOT NULL AND queue_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS `users_client_suspended_idx` on `users` (`client_suspended`);

CREATE INDEX IF NOT EXISTS `users_created_at_idx` ON `users` (`created_at`);

CREATE INDEX IF NOT EXISTS `users_created_by_idx` on `users` (`created_by`);

CREATE UNIQUE INDEX IF NOT EXISTS `users_email_unique` ON `users` (`email`);

CREATE INDEX IF NOT EXISTS `users_must_change_password_idx` on `users` (`must_change_password`);

CREATE INDEX IF NOT EXISTS `wa_connections_store_id_idx` ON `wa_connections` (`store_id`);

PRAGMA foreign_keys=ON;

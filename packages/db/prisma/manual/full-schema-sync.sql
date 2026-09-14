-- ============================================================
-- Servd — idempotent full schema sync
-- Safe to run on an existing database: creates what's missing,
-- skips what already exists (tables, columns, enums, indexes, FKs).
-- ============================================================

CREATE SCHEMA IF NOT EXISTS "public";
DO $$ BEGIN CREATE TYPE "StaffRole" AS ENUM ('kitchen', 'cashier', 'manager', 'admin'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'kitchen';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'cashier';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE "StaffRole" ADD VALUE IF NOT EXISTS 'admin';

DO $$ BEGIN CREATE TYPE "RestaurantStatus" AS ENUM ('active', 'suspended', 'pending'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "RestaurantStatus" ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE "RestaurantStatus" ADD VALUE IF NOT EXISTS 'suspended';
ALTER TYPE "RestaurantStatus" ADD VALUE IF NOT EXISTS 'pending';

DO $$ BEGIN CREATE TYPE "OrderStatus" AS ENUM ('pending', 'new', 'preparing', 'done', 'closed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'new';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'preparing';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'done';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'closed';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'cancelled';

DO $$ BEGIN CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'pending', 'paid', 'failed', 'refunded'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'unpaid';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'refunded';

DO $$ BEGIN CREATE TYPE "PaymentMethod" AS ENUM ('online_gcash', 'online_card', 'cash', 'card_terminal'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'online_gcash';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'online_card';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'cash';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'card_terminal';

DO $$ BEGIN CREATE TYPE "Gateway" AS ENUM ('paymongo', 'manual'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "Gateway" ADD VALUE IF NOT EXISTS 'paymongo';
ALTER TYPE "Gateway" ADD VALUE IF NOT EXISTS 'manual';

DO $$ BEGIN CREATE TYPE "FeedbackMode" AS ENUM ('on_device', 'follow_up', 'both'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "FeedbackMode" ADD VALUE IF NOT EXISTS 'on_device';
ALTER TYPE "FeedbackMode" ADD VALUE IF NOT EXISTS 'follow_up';
ALTER TYPE "FeedbackMode" ADD VALUE IF NOT EXISTS 'both';

DO $$ BEGIN CREATE TYPE "PrintMethod" AS ENUM ('network', 'cloud', 'bluetooth', 'os_dialog'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "PrintMethod" ADD VALUE IF NOT EXISTS 'network';
ALTER TYPE "PrintMethod" ADD VALUE IF NOT EXISTS 'cloud';
ALTER TYPE "PrintMethod" ADD VALUE IF NOT EXISTS 'bluetooth';
ALTER TYPE "PrintMethod" ADD VALUE IF NOT EXISTS 'os_dialog';

DO $$ BEGIN CREATE TYPE "MarketingConsent" AS ENUM ('none', 'pending', 'confirmed', 'opted_out'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "MarketingConsent" ADD VALUE IF NOT EXISTS 'none';
ALTER TYPE "MarketingConsent" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "MarketingConsent" ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE "MarketingConsent" ADD VALUE IF NOT EXISTS 'opted_out';

DO $$ BEGIN CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'trialing';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'past_due';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'cancelled';

DO $$ BEGIN CREATE TYPE "PlanModuleType" AS ENUM ('hris', 'inventory', 'custom_domain'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "PlanModuleType" ADD VALUE IF NOT EXISTS 'hris';
ALTER TYPE "PlanModuleType" ADD VALUE IF NOT EXISTS 'inventory';
ALTER TYPE "PlanModuleType" ADD VALUE IF NOT EXISTS 'custom_domain';

DO $$ BEGIN CREATE TYPE "StockReason" AS ENUM ('sale', 'waste', 'received', 'adjustment', 'count'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "StockReason" ADD VALUE IF NOT EXISTS 'sale';
ALTER TYPE "StockReason" ADD VALUE IF NOT EXISTS 'waste';
ALTER TYPE "StockReason" ADD VALUE IF NOT EXISTS 'received';
ALTER TYPE "StockReason" ADD VALUE IF NOT EXISTS 'adjustment';
ALTER TYPE "StockReason" ADD VALUE IF NOT EXISTS 'count';

DO $$ BEGIN CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'ordered', 'received', 'cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'draft';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'ordered';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'received';
ALTER TYPE "PurchaseOrderStatus" ADD VALUE IF NOT EXISTS 'cancelled';

DO $$ BEGIN CREATE TYPE "EmploymentType" AS ENUM ('full_time', 'part_time', 'contract'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "EmploymentType" ADD VALUE IF NOT EXISTS 'full_time';
ALTER TYPE "EmploymentType" ADD VALUE IF NOT EXISTS 'part_time';
ALTER TYPE "EmploymentType" ADD VALUE IF NOT EXISTS 'contract';

DO $$ BEGIN CREATE TYPE "PayType" AS ENUM ('hourly', 'monthly'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "PayType" ADD VALUE IF NOT EXISTS 'hourly';
ALTER TYPE "PayType" ADD VALUE IF NOT EXISTS 'monthly';

DO $$ BEGIN CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'inactive'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "EmployeeStatus" ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE "EmployeeStatus" ADD VALUE IF NOT EXISTS 'inactive';

DO $$ BEGIN CREATE TYPE "LeaveStatus" AS ENUM ('pending', 'approved', 'rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "LeaveStatus" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "LeaveStatus" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "LeaveStatus" ADD VALUE IF NOT EXISTS 'rejected';

DO $$ BEGIN CREATE TYPE "SwapStatus" AS ENUM ('pending', 'approved', 'rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "SwapStatus" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "SwapStatus" ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE "SwapStatus" ADD VALUE IF NOT EXISTS 'rejected';

DO $$ BEGIN CREATE TYPE "OrderType" AS ENUM ('dine_in', 'takeout', 'delivery'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'dine_in';
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'takeout';
ALTER TYPE "OrderType" ADD VALUE IF NOT EXISTS 'delivery';

CREATE TABLE IF NOT EXISTS "platform_admins" (
    "id" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "authUserId" TEXT;
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "platform_admins" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthly" INTEGER NOT NULL,
    "limits" JSONB NOT NULL,
    "trialDays" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "priceMonthly" INTEGER;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "limits" JSONB;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "trialDays" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "plan_modules" (
    "planId" TEXT NOT NULL,
    "module" "PlanModuleType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "plan_modules_pkey" PRIMARY KEY ("planId","module")
);

ALTER TABLE "plan_modules" ADD COLUMN IF NOT EXISTS "planId" TEXT;
ALTER TABLE "plan_modules" ADD COLUMN IF NOT EXISTS "module" "PlanModuleType";
ALTER TABLE "plan_modules" ADD COLUMN IF NOT EXISTS "enabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "restaurants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "RestaurantStatus" NOT NULL DEFAULT 'pending',
    "planId" TEXT,
    "displayName" TEXT,
    "logoUrl" TEXT,
    "brandPrimaryColor" TEXT,
    "brandAccentColor" TEXT,
    "coverImageUrl" TEXT,
    "tagline" TEXT,
    "googleReviewUrl" TEXT,
    "feedbackMode" "FeedbackMode" NOT NULL DEFAULT 'follow_up',
    "printMethod" "PrintMethod" NOT NULL DEFAULT 'network',
    "printerConfig" JSONB,
    "autoPrint" BOOLEAN NOT NULL DEFAULT false,
    "paymentGateway" "Gateway",
    "paymentCredentialsEnc" TEXT,
    "paymentOnlineEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smsSenderName" TEXT,
    "smsCreditBalance" INTEGER NOT NULL DEFAULT 0,
    "smsDoubleOptIn" BOOLEAN NOT NULL DEFAULT true,
    "subdomain" TEXT,
    "customDomain" TEXT,
    "customDomainVerifiedAt" TIMESTAMP(3),
    "onboardingCompletedAt" TIMESTAMP(3),
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "autoOutOfStock" BOOLEAN NOT NULL DEFAULT false,
    "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false,
    "loyaltyPesosPerPoint" INTEGER NOT NULL DEFAULT 20,
    "loyaltyPointValue" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "status" "RestaurantStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "planId" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "brandPrimaryColor" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "brandAccentColor" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "coverImageUrl" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "tagline" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "googleReviewUrl" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "feedbackMode" "FeedbackMode" NOT NULL DEFAULT 'follow_up';
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "printMethod" "PrintMethod" NOT NULL DEFAULT 'network';
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "printerConfig" JSONB;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "autoPrint" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "autoPrintReceipt" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "openDrawerOn" TEXT NOT NULL DEFAULT 'cash';
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "paymentGateway" "Gateway";
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "paymentCredentialsEnc" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "paymentOnlineEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "smsSenderName" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "smsCreditBalance" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "smsDoubleOptIn" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "subdomain" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "customDomain" TEXT;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "customDomainVerifiedAt" TIMESTAMP(3);
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "defaultLocale" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "autoOutOfStock" BOOLEAN NOT NULL DEFAULT false;
-- Defaults FALSE: a fresh install has no existing customers to grandfather.
-- add-qr-grandfather.sql is what backfills a live database, once.
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "qrGrandfathered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "loyaltyPesosPerPoint" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "loyaltyPointValue" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "storefront_settings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "hours" JSONB,
    "deliveryZones" JSONB,
    "pauseWhenClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "storefront_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "hours" JSONB;
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "deliveryZones" JSONB;
ALTER TABLE "storefront_settings" ADD COLUMN IF NOT EXISTS "pauseWhenClosed" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "payroll_settings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "sssAmount" INTEGER NOT NULL DEFAULT 0,
    "philhealthAmount" INTEGER NOT NULL DEFAULT 0,
    "pagibigAmount" INTEGER NOT NULL DEFAULT 0,
    "birAmount" INTEGER NOT NULL DEFAULT 0,
    "thirteenthMonth" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payroll_settings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payroll_settings" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "payroll_settings" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "payroll_settings" ADD COLUMN IF NOT EXISTS "sssAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_settings" ADD COLUMN IF NOT EXISTS "philhealthAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_settings" ADD COLUMN IF NOT EXISTS "pagibigAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_settings" ADD COLUMN IF NOT EXISTS "birAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_settings" ADD COLUMN IF NOT EXISTS "thirteenthMonth" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "menu_item_costs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_costs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "menu_item_costs" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "menu_item_costs" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "menu_item_costs" ADD COLUMN IF NOT EXISTS "menuItemId" TEXT;
ALTER TABLE "menu_item_costs" ADD COLUMN IF NOT EXISTS "cost" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "expenses" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3);
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "amount" INTEGER;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "loyalty_accounts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "loyalty_accounts" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "loyalty_accounts" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "loyalty_accounts" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "loyalty_accounts" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "loyalty_accounts" ADD COLUMN IF NOT EXISTS "points" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "loyalty_accounts" ADD COLUMN IF NOT EXISTS "totalEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "loyalty_accounts" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "loyalty_accounts" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "orderId" TEXT,
    "points" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "loyalty_transactions" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "loyalty_transactions" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "loyalty_transactions" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "loyalty_transactions" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "loyalty_transactions" ADD COLUMN IF NOT EXISTS "points" INTEGER;
ALTER TABLE "loyalty_transactions" ADD COLUMN IF NOT EXISTS "kind" TEXT;
ALTER TABLE "loyalty_transactions" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "staff_users" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "authUserId" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "authUserId" TEXT;
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "role" "StaffRole";
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "displayName" TEXT;
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "failedCharges" INTEGER NOT NULL DEFAULT 0,
    "providerCustomerId" TEXT,
    "providerPaymentMethodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "planId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "status" "SubscriptionStatus" NOT NULL DEFAULT 'trialing';
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "failedCharges" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "providerCustomerId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "providerPaymentMethodId" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "restaurant_invoices" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "providerRef" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "restaurant_invoices_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "restaurant_invoices" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "restaurant_invoices" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "restaurant_invoices" ADD COLUMN IF NOT EXISTS "amount" INTEGER;
ALTER TABLE "restaurant_invoices" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'open';
ALTER TABLE "restaurant_invoices" ADD COLUMN IF NOT EXISTS "periodStart" TIMESTAMP(3);
ALTER TABLE "restaurant_invoices" ADD COLUMN IF NOT EXISTS "periodEnd" TIMESTAMP(3);
ALTER TABLE "restaurant_invoices" ADD COLUMN IF NOT EXISTS "providerRef" TEXT;
ALTER TABLE "restaurant_invoices" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "restaurant_invoices" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "tables" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableNumber" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "tableNumber" TEXT;
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "qrToken" TEXT;
ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "category_translations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "category_translations" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "category_translations" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "category_translations" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "category_translations" ADD COLUMN IF NOT EXISTS "locale" TEXT;
ALTER TABLE "category_translations" ADD COLUMN IF NOT EXISTS "name" TEXT;

CREATE TABLE IF NOT EXISTS "menu_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "videoPosterUrl" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "price" INTEGER;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "videoPosterUrl" TEXT;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "menu_items" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "menu_item_translations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "menu_item_translations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "menu_item_translations" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "menu_item_translations" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "menu_item_translations" ADD COLUMN IF NOT EXISTS "menuItemId" TEXT;
ALTER TABLE "menu_item_translations" ADD COLUMN IF NOT EXISTS "locale" TEXT;
ALTER TABLE "menu_item_translations" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "menu_item_translations" ADD COLUMN IF NOT EXISTS "description" TEXT;

CREATE TABLE IF NOT EXISTS "modifier_groups" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "minSelect" INTEGER NOT NULL DEFAULT 0,
    "maxSelect" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "required" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "minSelect" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "maxSelect" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "modifier_groups" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "modifiers" (
    "id" TEXT NOT NULL,
    "modifierGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "modifierGroupId" TEXT;
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "priceDelta" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "modifiers" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "menu_item_modifier_groups" (
    "menuItemId" TEXT NOT NULL,
    "modifierGroupId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_modifier_groups_pkey" PRIMARY KEY ("menuItemId","modifierGroupId")
);

ALTER TABLE "menu_item_modifier_groups" ADD COLUMN IF NOT EXISTS "menuItemId" TEXT;
ALTER TABLE "menu_item_modifier_groups" ADD COLUMN IF NOT EXISTS "modifierGroupId" TEXT;
ALTER TABLE "menu_item_modifier_groups" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "suppliers" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "contactJson" JSONB;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "inventory_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "stockQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPerUnit" INTEGER NOT NULL DEFAULT 0,
    "reorderLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "stockQty" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "costPerUnit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "reorderLevel" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "menuItemId" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "recipe_components" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "recipe_components_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "recipe_components" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "recipe_components" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "recipe_components" ADD COLUMN IF NOT EXISTS "menuItemId" TEXT;
ALTER TABLE "recipe_components" ADD COLUMN IF NOT EXISTS "inventoryItemId" TEXT;
ALTER TABLE "recipe_components" ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "stock_movements" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "changeQty" DOUBLE PRECISION NOT NULL,
    "reason" "StockReason" NOT NULL,
    "unitCost" INTEGER,
    "refId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "inventoryItemId" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "changeQty" DOUBLE PRECISION;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "reason" "StockReason";
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "unitCost" INTEGER;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "refId" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "purchase_orders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "supplierId" TEXT,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "supplierId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft';
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "purchase_order_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" INTEGER NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "purchaseOrderId" TEXT;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "inventoryItemId" TEXT;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "quantity" DOUBLE PRECISION;
ALTER TABLE "purchase_order_items" ADD COLUMN IF NOT EXISTS "unitCost" INTEGER;

CREATE TABLE IF NOT EXISTS "employees" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "staffUserId" TEXT,
    "fullName" TEXT NOT NULL,
    "title" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'full_time',
    "payRate" INTEGER NOT NULL DEFAULT 0,
    "payType" "PayType" NOT NULL DEFAULT 'hourly',
    "hiredAt" TIMESTAMP(3),
    "contactJson" JSONB,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "clockPin" TEXT,
    "clockToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "staffUserId" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "fullName" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "employmentType" "EmploymentType" NOT NULL DEFAULT 'full_time';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "payRate" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "payType" "PayType" NOT NULL DEFAULT 'hourly';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "hiredAt" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "contactJson" JSONB;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "status" "EmployeeStatus" NOT NULL DEFAULT 'active';
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "clockPin" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "clockToken" TEXT;
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "employee_documents" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "url" TEXT;
ALTER TABLE "employee_documents" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "shifts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "employeeId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "startsAt" TIMESTAMP(3);
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "endsAt" TIMESTAMP(3);
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "role" TEXT;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "availabilities" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,

    CONSTRAINT "availabilities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "availabilities" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "availabilities" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "availabilities" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "availabilities" ADD COLUMN IF NOT EXISTS "dayOfWeek" INTEGER;
ALTER TABLE "availabilities" ADD COLUMN IF NOT EXISTS "startMinute" INTEGER;
ALTER TABLE "availabilities" ADD COLUMN IF NOT EXISTS "endMinute" INTEGER;

CREATE TABLE IF NOT EXISTS "shift_swap_requests" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "status" "SwapStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_swap_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "shift_swap_requests" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "shift_swap_requests" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "shift_swap_requests" ADD COLUMN IF NOT EXISTS "shiftId" TEXT;
ALTER TABLE "shift_swap_requests" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "shift_swap_requests" ADD COLUMN IF NOT EXISTS "status" "SwapStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "shift_swap_requests" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "shift_swap_requests" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "time_entries" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "clockIn" TIMESTAMP(3) NOT NULL,
    "clockOut" TIMESTAMP(3),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'qr',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "clockInPhotoUrl" TEXT,
    "clockOutPhotoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "clockIn" TIMESTAMP(3);
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "clockOut" TIMESTAMP(3);
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "breakMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'qr';
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "approved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "clockInPhotoUrl" TEXT;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "clockOutPhotoUrl" TEXT;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "leave_types" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "leave_requests" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'pending',
    "approverId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "leaveTypeId" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "status" "LeaveStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "approverId" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "leave_balances" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "leave_balances" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "leave_balances" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "leave_balances" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "leave_balances" ADD COLUMN IF NOT EXISTS "leaveTypeId" TEXT;
ALTER TABLE "leave_balances" ADD COLUMN IF NOT EXISTS "balance" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "orders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableId" TEXT,
    "orderType" "OrderType" NOT NULL DEFAULT 'dine_in',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "customerAddress" TEXT,
    "customerLat" DOUBLE PRECISION,
    "customerLng" DOUBLE PRECISION,
    "deliveryStatus" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'new',
    "billRequested" BOOLEAN NOT NULL DEFAULT false,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "total" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "discountLabel" TEXT,
    "inventoryDeductedAt" TIMESTAMP(3),
    "servedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tableId" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "orderType" "OrderType" NOT NULL DEFAULT 'dine_in';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerAddress" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerLat" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "customerLng" DOUBLE PRECISION;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deliveryStatus" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "status" "OrderStatus" NOT NULL DEFAULT 'new';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "billRequested" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "total" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discountLabel" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "inventoryDeductedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "servedAt" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "promotions" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "promotions" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "nameAtTime" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "menuItemId" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "nameAtTime" TEXT;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unitPrice" INTEGER;
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "note" TEXT;

CREATE TABLE IF NOT EXISTS "order_item_modifiers" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "nameAtTime" TEXT NOT NULL,
    "priceDeltaAtTime" INTEGER NOT NULL,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "order_item_modifiers" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "order_item_modifiers" ADD COLUMN IF NOT EXISTS "orderItemId" TEXT;
ALTER TABLE "order_item_modifiers" ADD COLUMN IF NOT EXISTS "modifierId" TEXT;
ALTER TABLE "order_item_modifiers" ADD COLUMN IF NOT EXISTS "nameAtTime" TEXT;
ALTER TABLE "order_item_modifiers" ADD COLUMN IF NOT EXISTS "priceDeltaAtTime" INTEGER;

CREATE TABLE IF NOT EXISTS "print_jobs" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT,
    "method" "PrintMethod" NOT NULL,
    "payloadBase64" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedAt" TIMESTAMP(3),

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "method" "PrintMethod";
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "payloadBase64" TEXT;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "print_jobs" ADD COLUMN IF NOT EXISTS "printedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "gateway" "Gateway" NOT NULL,
    "gatewayRef" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "amount" INTEGER;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "method" "PaymentMethod";
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "gateway" "Gateway";
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "gatewayRef" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "status" "PaymentStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "feedback" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "orderId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "googleInviteShown" BOOLEAN NOT NULL DEFAULT false,
    "googleClick" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "rating" INTEGER;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "comment" TEXT;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "googleInviteShown" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "googleClick" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "customer_contacts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "marketingConsent" "MarketingConsent" NOT NULL DEFAULT 'none',
    "consentText" TEXT,
    "consentSource" TEXT,
    "optInAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "optOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_contacts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "marketingConsent" "MarketingConsent" NOT NULL DEFAULT 'none';
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "consentText" TEXT;
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "consentSource" TEXT;
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "optInAt" TIMESTAMP(3);
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP(3);
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "optOutAt" TIMESTAMP(3);
ALTER TABLE "customer_contacts" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "sms_campaigns" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_campaigns_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "recipientCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sms_campaigns" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "sms_messages" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "contactId" TEXT;
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "status" TEXT;
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "providerRef" TEXT;
ALTER TABLE "sms_messages" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "sms_credit_ledger" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "change" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_credit_ledger_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "sms_credit_ledger" ADD COLUMN IF NOT EXISTS "id" TEXT;
ALTER TABLE "sms_credit_ledger" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "sms_credit_ledger" ADD COLUMN IF NOT EXISTS "change" INTEGER;
ALTER TABLE "sms_credit_ledger" ADD COLUMN IF NOT EXISTS "reason" TEXT;
ALTER TABLE "sms_credit_ledger" ADD COLUMN IF NOT EXISTS "balanceAfter" INTEGER;
ALTER TABLE "sms_credit_ledger" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_authUserId_key" ON "platform_admins"("authUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_email_key" ON "platform_admins"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_slug_key" ON "restaurants"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_subdomain_key" ON "restaurants"("subdomain");
CREATE UNIQUE INDEX IF NOT EXISTS "restaurants_customDomain_key" ON "restaurants"("customDomain");
CREATE UNIQUE INDEX IF NOT EXISTS "storefront_settings_restaurantId_key" ON "storefront_settings"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_settings_restaurantId_key" ON "payroll_settings"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_costs_menuItemId_key" ON "menu_item_costs"("menuItemId");
CREATE INDEX IF NOT EXISTS "menu_item_costs_restaurantId_idx" ON "menu_item_costs"("restaurantId");
CREATE INDEX IF NOT EXISTS "expenses_restaurantId_date_idx" ON "expenses"("restaurantId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "loyalty_accounts_restaurantId_phone_key" ON "loyalty_accounts"("restaurantId", "phone");
CREATE INDEX IF NOT EXISTS "loyalty_transactions_restaurantId_phone_idx" ON "loyalty_transactions"("restaurantId", "phone");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_users_authUserId_key" ON "staff_users"("authUserId");
CREATE INDEX IF NOT EXISTS "staff_users_restaurantId_idx" ON "staff_users"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "staff_users_restaurantId_email_key" ON "staff_users"("restaurantId", "email");
CREATE INDEX IF NOT EXISTS "subscriptions_status_currentPeriodEnd_idx" ON "subscriptions"("status", "currentPeriodEnd");
CREATE INDEX IF NOT EXISTS "restaurant_invoices_restaurantId_idx" ON "restaurant_invoices"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "tables_qrToken_key" ON "tables"("qrToken");
CREATE INDEX IF NOT EXISTS "tables_restaurantId_idx" ON "tables"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "tables_restaurantId_tableNumber_key" ON "tables"("restaurantId", "tableNumber");
CREATE INDEX IF NOT EXISTS "categories_restaurantId_idx" ON "categories"("restaurantId");
CREATE INDEX IF NOT EXISTS "category_translations_restaurantId_idx" ON "category_translations"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "category_translations_categoryId_locale_key" ON "category_translations"("categoryId", "locale");
CREATE INDEX IF NOT EXISTS "menu_items_restaurantId_idx" ON "menu_items"("restaurantId");
CREATE INDEX IF NOT EXISTS "menu_items_categoryId_idx" ON "menu_items"("categoryId");
CREATE INDEX IF NOT EXISTS "menu_item_translations_restaurantId_idx" ON "menu_item_translations"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_translations_menuItemId_locale_key" ON "menu_item_translations"("menuItemId", "locale");
CREATE INDEX IF NOT EXISTS "modifier_groups_restaurantId_idx" ON "modifier_groups"("restaurantId");
CREATE INDEX IF NOT EXISTS "modifiers_modifierGroupId_idx" ON "modifiers"("modifierGroupId");
CREATE INDEX IF NOT EXISTS "suppliers_restaurantId_idx" ON "suppliers"("restaurantId");
CREATE INDEX IF NOT EXISTS "inventory_items_restaurantId_idx" ON "inventory_items"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_items_menuItemId_key" ON "inventory_items"("menuItemId");
CREATE INDEX IF NOT EXISTS "recipe_components_restaurantId_idx" ON "recipe_components"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "recipe_components_menuItemId_inventoryItemId_key" ON "recipe_components"("menuItemId", "inventoryItemId");
CREATE INDEX IF NOT EXISTS "stock_movements_restaurantId_createdAt_idx" ON "stock_movements"("restaurantId", "createdAt");
CREATE INDEX IF NOT EXISTS "stock_movements_inventoryItemId_idx" ON "stock_movements"("inventoryItemId");
CREATE INDEX IF NOT EXISTS "purchase_orders_restaurantId_idx" ON "purchase_orders"("restaurantId");
CREATE INDEX IF NOT EXISTS "purchase_order_items_restaurantId_idx" ON "purchase_order_items"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "employees_staffUserId_key" ON "employees"("staffUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "employees_clockToken_key" ON "employees"("clockToken");
CREATE INDEX IF NOT EXISTS "employees_restaurantId_idx" ON "employees"("restaurantId");
CREATE INDEX IF NOT EXISTS "employee_documents_restaurantId_idx" ON "employee_documents"("restaurantId");
CREATE INDEX IF NOT EXISTS "shifts_restaurantId_startsAt_idx" ON "shifts"("restaurantId", "startsAt");
CREATE INDEX IF NOT EXISTS "availabilities_restaurantId_idx" ON "availabilities"("restaurantId");
CREATE INDEX IF NOT EXISTS "shift_swap_requests_restaurantId_idx" ON "shift_swap_requests"("restaurantId");
CREATE INDEX IF NOT EXISTS "time_entries_restaurantId_clockIn_idx" ON "time_entries"("restaurantId", "clockIn");
CREATE INDEX IF NOT EXISTS "time_entries_employeeId_idx" ON "time_entries"("employeeId");
CREATE INDEX IF NOT EXISTS "leave_types_restaurantId_idx" ON "leave_types"("restaurantId");
CREATE INDEX IF NOT EXISTS "leave_requests_restaurantId_idx" ON "leave_requests"("restaurantId");
CREATE INDEX IF NOT EXISTS "leave_balances_restaurantId_idx" ON "leave_balances"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "leave_balances_employeeId_leaveTypeId_key" ON "leave_balances"("employeeId", "leaveTypeId");
CREATE INDEX IF NOT EXISTS "orders_restaurantId_status_idx" ON "orders"("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "orders_restaurantId_createdAt_idx" ON "orders"("restaurantId", "createdAt");
CREATE INDEX IF NOT EXISTS "orders_tableId_idx" ON "orders"("tableId");
CREATE INDEX IF NOT EXISTS "promotions_restaurantId_active_idx" ON "promotions"("restaurantId", "active");
CREATE INDEX IF NOT EXISTS "order_items_orderId_idx" ON "order_items"("orderId");
CREATE INDEX IF NOT EXISTS "order_item_modifiers_orderItemId_idx" ON "order_item_modifiers"("orderItemId");
CREATE INDEX IF NOT EXISTS "print_jobs_restaurantId_status_idx" ON "print_jobs"("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "payments_orderId_idx" ON "payments"("orderId");
CREATE INDEX IF NOT EXISTS "feedback_restaurantId_idx" ON "feedback"("restaurantId");
CREATE INDEX IF NOT EXISTS "feedback_restaurantId_createdAt_idx" ON "feedback"("restaurantId", "createdAt");
CREATE INDEX IF NOT EXISTS "customer_contacts_restaurantId_idx" ON "customer_contacts"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_contacts_restaurantId_phone_key" ON "customer_contacts"("restaurantId", "phone");
CREATE INDEX IF NOT EXISTS "sms_campaigns_restaurantId_idx" ON "sms_campaigns"("restaurantId");
CREATE INDEX IF NOT EXISTS "sms_messages_campaignId_idx" ON "sms_messages"("campaignId");
CREATE INDEX IF NOT EXISTS "sms_credit_ledger_restaurantId_idx" ON "sms_credit_ledger"("restaurantId");
DO $$ BEGIN ALTER TABLE "plan_modules" ADD CONSTRAINT "plan_modules_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "storefront_settings" ADD CONSTRAINT "storefront_settings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "menu_item_costs" ADD CONSTRAINT "menu_item_costs_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "menu_item_costs" ADD CONSTRAINT "menu_item_costs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "expenses" ADD CONSTRAINT "expenses_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "restaurant_invoices" ADD CONSTRAINT "restaurant_invoices_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "tables" ADD CONSTRAINT "tables_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "categories" ADD CONSTRAINT "categories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "menu_item_translations" ADD CONSTRAINT "menu_item_translations_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_modifierGroupId_fkey" FOREIGN KEY ("modifierGroupId") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_modifierGroupId_fkey" FOREIGN KEY ("modifierGroupId") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "recipe_components" ADD CONSTRAINT "recipe_components_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "employees" ADD CONSTRAINT "employees_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "shift_swap_requests" ADD CONSTRAINT "shift_swap_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "orders" ADD CONSTRAINT "orders_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "promotions" ADD CONSTRAINT "promotions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "feedback" ADD CONSTRAINT "feedback_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "feedback" ADD CONSTRAINT "feedback_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "customer_contacts" ADD CONSTRAINT "customer_contacts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "sms_campaigns" ADD CONSTRAINT "sms_campaigns_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "sms_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "customer_contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN ALTER TABLE "sms_credit_ledger" ADD CONSTRAINT "sms_credit_ledger_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
-- ============================================================
-- Row-Level Security for newer tenant tables
-- ============================================================
DO $$
declare t text;
begin
  foreach t in array array['promotions','loyalty_accounts','loyalty_transactions','expenses','payroll_settings','menu_item_costs','storefront_settings'] loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format('drop policy if exists tenant_isolation on %I;', t);
    execute format($f$
      create policy tenant_isolation on %I
      using (app.is_super_admin() or "restaurantId" = app.current_restaurant_id())
      with check (app.is_super_admin() or "restaurantId" = app.current_restaurant_id());
    $f$, t);
  end loop;
exception when others then null;
end $$;

-- Turning RLS on without granting privileges locks the app out of the table
-- entirely: every insert is refused before any policy is consulted. Omitting
-- this is what made a menu item's food cost silently reset to 0.00 on save.
-- Grants say "you may touch this table"; the policies above still decide which
-- rows. See fix-table-grants.sql, which repairs an existing database.
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;

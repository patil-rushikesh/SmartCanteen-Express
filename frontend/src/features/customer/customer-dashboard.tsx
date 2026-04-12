import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import {
  startTransition,
  useDeferredValue,
  useMemo,
  useState,
  type FormEvent
} from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/app/auth';
import { useToast } from '@/app/toasts';
import { AppShell } from '@/components/app-shell';
import { BackendStatusCard } from '@/components/backend-status-card';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Panel,
  SectionHeading,
  Select,
  SkeletonBlock,
  StatCard,
  Textarea
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { appConfig } from '@/lib/config';
import { formatCurrencyFromPaise, formatDateTime, formatDateShort } from '@/lib/format';
import { orderStatusMeta } from '@/lib/order';
import {
  ensureRazorpayCheckout
} from '@/lib/payments';
import { uniqueBy } from '@/lib/utils';
import type { CartItem, MenuItem, OrderRecord, QrToken } from '@/types/api';

type QrPreviewState = {
  order: OrderRecord;
  qr: QrToken;
  imageUrl: string;
};

type IssueDraft = {
  orderId: string;
  reason: string;
};

const tabs = [
  { id: 'menu', label: 'Menu', description: 'Browse the live menu, filter items, and build a backend-synced cart.' },
  { id: 'orders', label: 'Orders', description: 'Track payment, QR, fulfillment, and issue workflows in one place.' },
  { id: 'account', label: 'Account', description: 'View your campus profile and environment capabilities.' }
] as const;

export const CustomerDashboard = () => {
  const { user } = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabs.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab')! : 'menu';
  const [menuSearch, setMenuSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCanteenId, setSelectedCanteenId] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderDateFrom, setOrderDateFrom] = useState('');
  const [orderDateTo, setOrderDateTo] = useState('');
  const deferredMenuSearch = useDeferredValue(menuSearch);
  const deferredOrderSearch = useDeferredValue(orderSearch);
  const [qrPreview, setQrPreview] = useState<QrPreviewState | null>(null);
  const [issueDraft, setIssueDraft] = useState<IssueDraft | null>(null);
  const [isPayingOrderId, setIsPayingOrderId] = useState('');

  const menuQuery = useQuery({
    queryKey: ['customer', 'menu'],
    queryFn: () => api.customer.menu()
  });

  const cartQuery = useQuery({
    queryKey: ['customer', 'cart'],
    queryFn: () => api.customer.getCart()
  });

  const ordersQuery = useQuery({
    queryKey: ['customer', 'orders'],
    queryFn: () => api.customer.listOrders(),
    refetchInterval: (query) => {
      const orders = query.state.data as OrderRecord[] | undefined;
      return orders?.some((order) =>
        ['CREATED', 'PAYMENT_PENDING', 'QR_GENERATED', 'CONFIRMED', 'PREPARING', 'READY', 'DELAYED'].includes(
          order.status
        )
      )
        ? 9000
        : false;
    }
  });

  const persistCartMutation = useMutation({
    mutationFn: async (items: CartItem[]) => {
      if (items.length === 0) {
        await api.customer.clearCart();
        return [];
      }

      return api.customer.setCart(items);
    },
    onSuccess: (items) => {
      queryClient.setQueryData(['customer', 'cart'], items);
    },
    onError: (error) => {
      pushToast({
        title: 'Cart sync failed',
        description: error instanceof ApiError ? error.message : 'Please try again.',
        tone: 'error'
      });
    }
  });

  const createOrderMutation = useMutation({
    mutationFn: (payload: { canteenId: string; items: CartItem[] }) => api.customer.createOrder(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customer', 'orders'] }),
        queryClient.invalidateQueries({ queryKey: ['customer', 'cart'] })
      ]);
      startTransition(() => {
        const next = new URLSearchParams(searchParams);
        next.set('tab', 'orders');
        setSearchParams(next, { replace: true });
      });
      pushToast({
        title: 'Order created',
        description: 'Your order is ready for payment.',
        tone: 'success'
      });
    }
  });

  const issueMutation = useMutation({
    mutationFn: (payload: IssueDraft) => api.customer.reportIssue(payload.orderId, payload.reason),
    onSuccess: async () => {
      setIssueDraft(null);
      await queryClient.invalidateQueries({ queryKey: ['customer', 'orders'] });
      pushToast({
        title: 'Issue reported',
        description: 'The support request was attached to the order.',
        tone: 'success'
      });
    },
    onError: (error) => {
      pushToast({
        title: 'Issue submission failed',
        description: error instanceof ApiError ? error.message : 'Please try again.',
        tone: 'error'
      });
    }
  });

  const canteens = useMemo(
    () =>
      uniqueBy(
        (menuQuery.data ?? []).map((item) => ({
          id: item.canteenId,
          name: item.canteen?.name ?? `Canteen ${item.canteenId.slice(0, 8)}`,
          location: item.canteen?.location ?? ''
        })),
        (item) => item.id
      ),
    [menuQuery.data]
  );

  const categories = useMemo(
    () => uniqueBy((menuQuery.data ?? []).filter((item) => item.category).map((item) => item.category!), (item) => item),
    [menuQuery.data]
  );

  const filteredMenu = useMemo(() => {
    const query = deferredMenuSearch.toLowerCase();
    return (menuQuery.data ?? []).filter((item) => {
      const matchesSearch =
        !query ||
        [item.name, item.description ?? '', item.category ?? ''].join(' ').toLowerCase().includes(query);
      const matchesCategory = !selectedCategory || item.category === selectedCategory;
      const matchesCanteen = !selectedCanteenId || item.canteenId === selectedCanteenId;
      return matchesSearch && matchesCategory && matchesCanteen;
    });
  }, [deferredMenuSearch, menuQuery.data, selectedCategory, selectedCanteenId]);

  const menuById = useMemo(
    () => new Map((menuQuery.data ?? []).map((item) => [item.id, item])),
    [menuQuery.data]
  );

  const cartItems = cartQuery.data ?? [];

  const cartEntries = useMemo(
    () =>
      cartItems
        .map((cartItem) => {
          const menuItem = menuById.get(cartItem.menuItemId);
          return menuItem ? { menuItem, quantity: cartItem.quantity } : null;
        })
        .filter(Boolean) as Array<{ menuItem: MenuItem; quantity: number }>,
    [cartItems, menuById]
  );

  const cartTotal = cartEntries.reduce(
    (sum, entry) => sum + entry.menuItem.priceInPaise * entry.quantity,
    0
  );

  const activeCartCanteenId = cartEntries[0]?.menuItem.canteenId ?? '';

  const filteredOrders = useMemo(() => {
    const query = deferredOrderSearch.toLowerCase();
    const fromDate = orderDateFrom ? new Date(orderDateFrom) : null;
    const toDate = orderDateTo ? new Date(orderDateTo) : null;

    return (ordersQuery.data ?? []).filter((order) => {
      // Text search filter
      if (query) {
        const matches = [order.id, order.status, order.canteen.name, ...order.orderItems.map((item) => item.menuItemName)]
          .join(' ')
          .toLowerCase()
          .includes(query);
        if (!matches) return false;
      }

      // Date range filter
      const orderDate = new Date(order.createdAt);
      if (fromDate && orderDate < fromDate) return false;
      if (toDate) {
        const nextDay = new Date(toDate);
        nextDay.setDate(nextDay.getDate() + 1);
        if (orderDate >= nextDay) return false;
      }

      return true;
    });
  }, [deferredOrderSearch, orderDateFrom, orderDateTo, ordersQuery.data]);

  const changeTab = (tabId: string) => {
    startTransition(() => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tabId);
      setSearchParams(next, { replace: true });
    });
  };

  const persistCart = async (nextCart: CartItem[]) => {
    await persistCartMutation.mutateAsync(nextCart);
  };

  const changeCartQuantity = async (menuItem: MenuItem, nextQuantity: number) => {
    const existing = cartItems.find((item) => item.menuItemId === menuItem.id);
    let nextCart = [...cartItems];

    if (activeCartCanteenId && activeCartCanteenId !== menuItem.canteenId) {
      const proceed = window.confirm(
        'Your cart currently contains items from another canteen. Starting a new order will clear the previous cart. Continue?'
      );
      if (!proceed) {
        return;
      }

      nextCart = [];
    }

    if (nextQuantity <= 0) {
      nextCart = nextCart.filter((item) => item.menuItemId !== menuItem.id);
    } else if (existing) {
      nextCart = nextCart.map((item) =>
        item.menuItemId === menuItem.id ? { ...item, quantity: nextQuantity } : item
      );
    } else {
      nextCart = [...nextCart, { menuItemId: menuItem.id, quantity: nextQuantity }];
    }

    await persistCart(nextCart);
  };

  const clearCart = async () => {
    await persistCart([]);
    pushToast({
      title: 'Cart cleared',
      description: 'The backend cart has been emptied.',
      tone: 'success'
    });
  };

  const placeOrder = async () => {
    if (!cartEntries.length || !activeCartCanteenId) {
      pushToast({
        title: 'Cart is empty',
        description: 'Add items from a single canteen before placing an order.',
        tone: 'error'
      });
      return;
    }

    try {
      await createOrderMutation.mutateAsync({
        canteenId: activeCartCanteenId,
        items: cartItems
      });
    } catch (error) {
      pushToast({
        title: 'Could not create order',
        description: error instanceof ApiError ? error.message : 'Please try again.',
        tone: 'error'
      });
    }
  };

  const openQrPreview = async (order: OrderRecord) => {
    try {
      const qr = await api.customer.getQr(order.id);
      const imageUrl = await QRCode.toDataURL(qr.signedToken, {
        margin: 2,
        width: 280
      });
      setQrPreview({ order, qr, imageUrl });
    } catch (error) {
      pushToast({
        title: 'Could not load QR',
        description: error instanceof ApiError ? error.message : 'Please try again.',
        tone: 'error'
      });
    }
  };

  const handlePayment = async (order: OrderRecord) => {
    setIsPayingOrderId(order.id);

    try {
      const payment = await api.customer.initiatePayment(order.id, crypto.randomUUID());

      if (!payment.providerOrderId) {
        throw new Error('Payment provider order id is missing.');
      }


      await ensureRazorpayCheckout();

      await new Promise<void>((resolve, reject) => {
        if (!window.Razorpay) {
          reject(new Error('Razorpay checkout is unavailable.'));
          return;
        }

        const razorpay = new window.Razorpay({
          key: appConfig.razorpayKeyId,
          amount: payment.amountInPaise,
          currency: payment.currency,
          order_id: payment.providerOrderId,
          name: 'Smart Canteen',
          description: `Order ${order.id}`,
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const result = await api.customer.verifyPayment({
                providerOrderId: response.razorpay_order_id,
                providerPaymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature
              });

              // Invalidate orders to refetch with updated payment/QR status
              await queryClient.invalidateQueries({ queryKey: ['customer', 'orders'] });

              pushToast({
                title: 'Payment confirmed',
                description: `Your order has been confirmed and your QR code is ready. Order: ${result.order.id.slice(0, 8)}...`,
                tone: 'success'
              });

              resolve();
            } catch (error) {
              reject(error);
            }
          },
          modal: {
            ondismiss: () => resolve()
          },
          theme: {
            color: '#bb5a2a'
          }
        });

        razorpay.open();
      });
    } catch (error) {
      pushToast({
        title: 'Payment could not start',
        description: error instanceof ApiError ? error.message : 'Please try again.',
        tone: 'error'
      });
    } finally {
      setIsPayingOrderId('');
    }
  };

  const submitIssue = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!issueDraft) {
      return;
    }

    await issueMutation.mutateAsync(issueDraft);
  };

  const profileStats = {
    orders: ordersQuery.data?.length ?? 0,
    cartItems: cartEntries.reduce((sum, item) => sum + item.quantity, 0),
    spend: (ordersQuery.data ?? []).reduce((sum, order) => sum + order.totalInPaise, 0)
  };

  return (
    <>
      <AppShell
        eyebrow="Customer workspace"
        title="Order faster, pay cleanly, and keep QR pickup on track."
        description="This workspace drives the full customer API surface: menu browsing, cart sync, checkout, payment verification, QR retrieval, and issue escalation."
        tabs={[...tabs]}
        activeTab={activeTab}
        onTabChange={changeTab}
      >
        <div className="space-y-6">
          {activeTab === 'menu' ? (
            <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
              <Panel>
                <SectionHeading
                  eyebrow="Live menu"
                  title="Browse by canteen, category, or craving"
                  description="Every item shown here comes from the customer menu route and reflects the current tenant visibility rules."
                />
                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  <Field label="Search">
                    <Input
                      value={menuSearch}
                      onChange={(event) => setMenuSearch(event.target.value)}
                      placeholder="Sandwich, coffee, dosa..."
                    />
                  </Field>
                  <Field label="Category">
                    <Select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                      <option value="">All categories</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Canteen">
                    <Select value={selectedCanteenId} onChange={(event) => setSelectedCanteenId(event.target.value)}>
                      <option value="">All canteens</option>
                      {canteens.map((canteen) => (
                        <option key={canteen.id} value={canteen.id}>
                          {canteen.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                {menuQuery.isLoading ? (
                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <SkeletonBlock key={index} className="h-64" />
                    ))}
                  </div>
                ) : filteredMenu.length ? (
                  <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    {filteredMenu.map((item) => {
                      const quantity = cartItems.find((cartItem) => cartItem.menuItemId === item.id)?.quantity ?? 0;
                      return (
                        <article
                          key={item.id}
                          className="rounded-[1.9rem] border border-[#ddcfb3] bg-white/75 p-5"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-xl font-semibold text-ink">{item.name}</h3>
                                <Badge tone={item.isAvailable ? 'success' : 'danger'}>
                                  {item.isAvailable ? 'Available' : 'Unavailable'}
                                </Badge>
                              </div>
                              <p className="mt-2 text-sm text-[#5d584d]">
                                {item.description || 'Freshly prepared menu item with live backend pricing.'}
                              </p>
                            </div>
                            <div className="rounded-[1.4rem] bg-[#f8f1e3] px-4 py-3 text-right">
                              <p className="text-xs uppercase tracking-[0.18em] text-[#7b6f5b]">Price</p>
                              <p className="mt-2 text-lg font-semibold text-ink">
                                {formatCurrencyFromPaise(item.priceInPaise)}
                              </p>
                            </div>
                          </div>

                          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[#6f695b]">
                            {item.category ? <Badge tone="accent">{item.category}</Badge> : null}
                            <span>Stock {item.stockQuantity}</span>
                            <span>{item.canteen?.name ?? `Canteen ${item.canteenId.slice(0, 8)}`}</span>
                            {item.canteen?.location ? <span>{item.canteen.location}</span> : null}
                          </div>

                          <div className="mt-6 flex flex-wrap items-center gap-3">
                            <Button
                              variant="secondary"
                              onClick={() => void changeCartQuantity(item, Math.max(0, quantity - 1))}
                              disabled={persistCartMutation.isPending || quantity === 0}
                            >
                              Remove
                            </Button>
                            <span className="rounded-full bg-[#efe2c7] px-4 py-2 text-sm font-semibold text-ink">
                              {quantity}
                            </span>
                            <Button
                              onClick={() => void changeCartQuantity(item, quantity + 1)}
                              disabled={!item.isAvailable || persistCartMutation.isPending}
                            >
                              Add to cart
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-6">
                    <EmptyState
                      title="No menu items matched"
                      description="Adjust the search or filters to widen the menu."
                    />
                  </div>
                )}
              </Panel>

              <Panel>
                <SectionHeading
                  eyebrow="Cart + checkout"
                  title="Backend-synced cart"
                  description="Cart state is stored on the backend and cleared automatically when an order is created."
                />
                <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-1">
                  <StatCard
                    label="Items"
                    value={String(cartEntries.reduce((sum, item) => sum + item.quantity, 0))}
                    hint="Total quantity currently reserved in your cart."
                  />
                  <StatCard
                    label="Canteen"
                    value={activeCartCanteenId ? activeCartCanteenId.slice(0, 8) : 'None'}
                    hint="Orders must stay within one canteen at a time."
                  />
                  <StatCard
                    label="Total"
                    value={formatCurrencyFromPaise(cartTotal)}
                    hint="Taxes are currently handled as zero by the backend."
                  />
                </div>

                <div className="mt-6 space-y-4">
                  {cartEntries.length ? (
                    cartEntries.map((entry) => (
                      <div
                        key={entry.menuItem.id}
                        className="rounded-[1.6rem] border border-[#ddcfb3] bg-white/75 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-ink">{entry.menuItem.name}</p>
                            <p className="mt-1 text-sm text-[#5d584d]">
                              {entry.quantity} x {formatCurrencyFromPaise(entry.menuItem.priceInPaise)}
                            </p>
                          </div>
                          <p className="font-semibold text-ink">
                            {formatCurrencyFromPaise(entry.menuItem.priceInPaise * entry.quantity)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <EmptyState
                      title="Your cart is empty"
                      description="Add a few menu items to place an order."
                    />
                  )}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Button onClick={() => void placeOrder()} disabled={!cartEntries.length || createOrderMutation.isPending}>
                    {createOrderMutation.isPending ? 'Placing order...' : 'Place order'}
                  </Button>
                  <Button variant="secondary" onClick={() => void clearCart()} disabled={!cartEntries.length}>
                    Clear cart
                  </Button>
                </div>
              </Panel>
            </div>
          ) : null}

          {activeTab === 'orders' ? (
            <Panel>
              <SectionHeading
                eyebrow="Order history"
                title="Track every order lifecycle"
                description="The customer order list is refreshed on an interval whenever an order is still moving through payment or fulfillment."
                action={
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
                      <Input
                        type="date"
                        value={orderDateFrom}
                        onChange={(event) => setOrderDateFrom(event.target.value)}
                        placeholder="From date"
                      />
                      <Input
                        type="date"
                        value={orderDateTo}
                        onChange={(event) => setOrderDateTo(event.target.value)}
                        placeholder="To date"
                      />
                    </div>
                    <div className="w-full sm:w-80">
                      <Input
                        value={orderSearch}
                        onChange={(event) => setOrderSearch(event.target.value)}
                        placeholder="Search by order, item, or status"
                      />
                    </div>
                  </div>
                }
              />
              {ordersQuery.isLoading ? (
                <div className="mt-6 space-y-4">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <SkeletonBlock key={index} className="h-64" />
                  ))}
                </div>
              ) : filteredOrders.length ? (
                <div className="mt-6 space-y-5">
                  {filteredOrders.map((order) => (
                    <article
                      key={order.id}
                      className="rounded-[2rem] border border-[#ddcfb3] bg-white/80 p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="font-display text-3xl text-ink">Order {order.id.slice(0, 8)}</h3>
                            <Badge tone={orderStatusMeta[order.status].tone}>{orderStatusMeta[order.status].label}</Badge>
                          </div>
                          <p className="mt-2 text-sm text-[#5d584d]">{orderStatusMeta[order.status].blurb}</p>
                          <p className="mt-2 text-sm text-[#6f695b]">
                            {formatDateTime(order.createdAt)} • {order.canteen.name}
                          </p>
                        </div>
                        <div className="rounded-[1.5rem] bg-[#f8f1e3] px-4 py-3 text-right">
                          <p className="text-xs uppercase tracking-[0.18em] text-[#7b6f5b]">Total</p>
                          <p className="mt-2 text-xl font-semibold text-ink">
                            {formatCurrencyFromPaise(order.totalInPaise)}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        {order.orderItems.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-[1.4rem] border border-[#e4d5ba] bg-[#fff8ed] p-4"
                          >
                            <p className="font-semibold text-ink">{item.menuItemName}</p>
                            <p className="mt-1 text-sm text-[#5d584d]">Quantity {item.quantity}</p>
                            <p className="mt-2 text-sm font-semibold text-ink">
                              {formatCurrencyFromPaise(item.totalPriceInPaise)}
                            </p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        {['CREATED', 'PAYMENT_FAILED'].includes(order.status) ? (
                          <Button
                            onClick={() => void handlePayment(order)}
                            disabled={isPayingOrderId === order.id}
                          >
                            {isPayingOrderId === order.id ? 'Processing...' : 'Pay now'}
                          </Button>
                        ) : null}
                        {order.status === 'QR_GENERATED' ? (
                          <Button variant="secondary" onClick={() => void openQrPreview(order)}>
                            View QR
                          </Button>
                        ) : null}
                        {['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'DELAYED'].includes(order.status) ? (
                          <Button variant="ghost" onClick={() => setIssueDraft({ orderId: order.id, reason: '' })}>
                            Report issue
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="mt-6">
                  <EmptyState
                    title="No orders found"
                    description="Your order history is empty or the current search term filtered everything out."
                  />
                </div>
              )}
            </Panel>
          ) : null}

          {activeTab === 'account' ? (
            <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
              <Panel>
                <SectionHeading
                  eyebrow="Profile"
                  title={user?.fullName ?? 'Customer'}
                  description="The account summary is hydrated from the authenticated profile route and kept in sync whenever the session refreshes."
                />
                <div className="mt-6 grid gap-4 md:grid-cols-3 xl:grid-cols-1">
                  <StatCard
                    label="Orders"
                    value={String(profileStats.orders)}
                    hint="Total orders on this account."
                  />
                  <StatCard
                    label="Cart items"
                    value={String(profileStats.cartItems)}
                    hint="Current quantity reserved in the live cart."
                  />
                  <StatCard
                    label="Spend"
                    value={formatCurrencyFromPaise(profileStats.spend)}
                    hint="Aggregate value across all recorded orders."
                  />
                </div>
              </Panel>

              <Panel>
                <SectionHeading
                  eyebrow="Session details"
                  title="Environment and identity"
                  description="This panel helps QA and support teams confirm which tenant and payment mode the frontend is currently using."
                />
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <ProfileRow label="Email" value={user?.email ?? 'Not available'} />
                  <ProfileRow label="Phone" value={user?.phone ?? 'Not available'} />
                  <ProfileRow label="Tenant ID" value={user?.tenantId ?? 'Not available'} />
                  <ProfileRow label="Student / faculty ID" value={user?.studentFacultyId ?? 'Not provided'} />
                  <ProfileRow label="Year of study" value={user?.yearOfStudy?.toString() ?? 'Not provided'} />
                  <ProfileRow label="Payment mode" value={appConfig.paymentMode} />
                </div>
                <BackendStatusCard
                  className="mt-6"
                  title="Service health"
                  description="The root and health routes stay visible here so QA can confirm the frontend is pointed at the expected backend."
                />
              </Panel>
            </div>
          ) : null}
        </div>
      </AppShell>

      <Modal
        open={Boolean(qrPreview)}
        title="Pickup QR"
        description="Show this QR to the canteen manager for confirmation. The token expires according to backend policy."
        onClose={() => setQrPreview(null)}
      >
        {qrPreview ? (
          <div className="grid gap-6 md:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-[1.8rem] border border-[#ddcfb3] bg-white p-4">
              <img className="w-full rounded-[1.5rem]" src={qrPreview.imageUrl} alt="Order QR code" />
            </div>
            <div className="space-y-4">
              <ProfileRow label="Order" value={qrPreview.order.id} />
              <ProfileRow label="Status" value={orderStatusMeta[qrPreview.order.status].label} />
              <ProfileRow label="Expires" value={formatDateTime(qrPreview.qr.expiresAt)} />
              <ProfileRow label="Generated" value={formatDateTime(qrPreview.qr.createdAt)} />
              <Field label="Signed token">
                <Textarea readOnly value={qrPreview.qr.signedToken} />
              </Field>
              <Button
                variant="secondary"
                onClick={() => navigator.clipboard.writeText(qrPreview.qr.signedToken)}
              >
                Copy signed token
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(issueDraft)}
        title="Report order issue"
        description="Issues are only accepted by the backend for eligible fulfillment states."
        onClose={() => setIssueDraft(null)}
      >
        <form className="grid gap-4" onSubmit={submitIssue}>
          <Field label="Describe the issue">
            <Textarea
              required
              minLength={5}
              value={issueDraft?.reason ?? ''}
              onChange={(event) =>
                setIssueDraft((current) => (current ? { ...current, reason: event.target.value } : current))
              }
              placeholder="Order delay, item mismatch, quality concern..."
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={issueMutation.isPending}>
              {issueMutation.isPending ? 'Submitting...' : 'Submit issue'}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setIssueDraft(null)}>
              Cancel
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

const ProfileRow = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-[1.5rem] border border-[#ddcfb3] bg-white/75 p-4">
    <p className="text-xs uppercase tracking-[0.18em] text-[#7b6f5b]">{label}</p>
    <p className="mt-2 text-sm font-semibold text-ink break-all">{value}</p>
  </div>
);

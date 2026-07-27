// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  Link,
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from './router';

function CurrentLocation() {
  const location = useLocation();
  return <output>{`${location.pathname}${location.search}${location.hash}`}</output>;
}

function CheckoutRoute() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  return (
    <div>
      <span>Application {id}</span>
      <span>Token {searchParams.get('token')}</span>
    </div>
  );
}

describe('SPA router', () => {
  it('matches dynamic routes and exposes decoded parameters and search values', () => {
    render(
      <MemoryRouter initialEntries={['/checkout/application%201?token=secure']}>
        <Routes>
          <Route path="/checkout/:id" element={<CheckoutRoute />} />
          <Route path="*" element={<p>Not found</p>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Application application 1')).toBeTruthy();
    expect(screen.getByText('Token secure')).toBeTruthy();
    expect(screen.queryByText('Not found')).toBeNull();
  });

  it('navigates internal links without a document reload', () => {
    render(
      <MemoryRouter>
        <Link to="/apply?source=home#form">Apply</Link>
        <CurrentLocation />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('link', { name: 'Apply' }));

    expect(screen.getByText('/apply?source=home#form')).toBeTruthy();
  });

  it('supports declarative redirects', async () => {
    render(
      <MemoryRouter initialEntries={['/cars']}>
        <Routes>
          <Route path="/cars" element={<Navigate to="/apply" replace />} />
          <Route path="/apply" element={<p>Application form</p>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Application form')).toBeTruthy();
  });
});

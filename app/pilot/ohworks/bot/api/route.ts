import { NextResponse } from 'next/server';

function removedRoute() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export {
  removedRoute as DELETE,
  removedRoute as GET,
  removedRoute as HEAD,
  removedRoute as OPTIONS,
  removedRoute as PATCH,
  removedRoute as POST,
  removedRoute as PUT,
};

import { Permission, Public } from '../auth/security.policy';
import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto, FilterExpenseDto, RejectExpenseDto } from './dto/create-expense.dto';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Permission('expenses:write')
  async createExpense(@Body() dto: CreateExpenseDto, @Req() req: any) {
    return this.expensesService.createExpense(dto, req.user);
  }

  @Put(':id/approve')
  @Permission('expenses:approve')
  async approveExpense(@Param('id') id: string, @Req() req: any) {
    return this.expensesService.approveExpense(id, req.user);
  }

  @Put(':id/reject')
  @Permission('expenses:approve')
  async rejectExpense(
    @Param('id') id: string,
    @Body() dto: RejectExpenseDto,
    @Req() req: any,
  ) {
    return this.expensesService.rejectExpense(id, dto, req.user);
  }

  @Get('stats')
  @Permission('expenses:read')
  async getStats(
    @Query('companyId') companyId?: string,
    @Query('branchId') branchId?: string,
    @Req() req?: any,
  ) {
    return this.expensesService.getStats(companyId, branchId, req?.user);
  }

  @Get(':id/pdf')
  @Permission('expenses:read')
  async getExpenseVoucherPdf(
    @Param('id') id: string,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const { buffer, expenseNumber } = await this.expensesService.getExpenseVoucherPdf(id, req.user);
    const cleanNumber = String(expenseNumber || id).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="expense-voucher-${cleanNumber}.pdf"`,
      'Cache-Control': 'private, no-store',
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get()
  @Permission('expenses:read')
  async getExpenses(@Query() filters: FilterExpenseDto, @Req() req: any) {
    return this.expensesService.getExpenses(filters, req.user);
  }
}
